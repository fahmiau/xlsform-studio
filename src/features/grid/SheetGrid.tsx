/**
 * Generic Glide grid for survey, choices, and settings (Tasks 2.2–2.7).
 *
 * File order is preserved; the frozen set is pulled left for display only
 * (Glide requires frozen columns to be leftmost). All access goes through the
 * row projection so Stage 3 folding can change one module.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DataEditor,
  GridCellKind,
  type DataEditorProps,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridSelection,
  type Item,
  type Rectangle,
  type Theme,
} from '@glideapps/glide-data-grid';
import { toast } from 'sonner';

import { findColumnKey } from '@/core/indexes/columns';
import type { ColumnBase } from '@/core/model/columns';
import { resolveColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import type { ColumnKey, ManagedSheetName, RowId } from '@/core/model/types';
import { applyTypeChange } from '@/core/ops/choices';
import { setCells, type CellEdit } from '@/core/ops/cells';
import { groupHiddenQuestionCount } from '@/core/ops/groups';
import { insertRows } from '@/core/ops/rows';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';
import { useIsDark } from '@/lib/theme';

import { cellValue, editValueText, textCell } from './cells/cellContent';
import { makeChoiceNameCell, choiceNameRenderer } from './cells/ChoiceNameCell';
import { makeCollapsedPillCell, collapsedPillRenderer } from './cells/CollapsedPillCell';
import { makeEnumCell, enumRenderer } from './cells/EnumCell';
import { gutterRenderer } from './cells/GutterCell';
import { buildDisplayColumns, columnKeyAt, type SheetGridConfig } from './columns';
import { pasteMatrix } from './clipboard';
import { isCellEditable, structuralRowKind, type StructuralRowKind } from './editability';
import { useEditorRouting } from './editors/useEditorRouting';
import { tileFill } from './fill';
import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from './geometry';
import { HeaderMenu, type HeaderMenuState } from './HeaderMenu';
import { AddColumnDialog } from './AddColumnDialog';
import {
  buildProjection,
  identityProjection,
  realRowIndex,
  visibleRowCount,
  visibleRowIndex,
  type RowProjection,
} from './projection';
import { RowContextMenu, type RowContextMenuState } from './RowContextMenu';
import { rowThemeOverride, type RowStyleKind } from './rowStyles';
import {
  gridSelectionForCell,
  refFromItem,
  selectionBounds,
  selectionFromRange,
  selectionToRowIds,
  findRowIndex,
} from './selection';
import { buildGridTheme } from './theme';
import { useClipboard } from './useClipboard';
import {
  deleteSelectedRows,
  duplicateSelectedRows,
  insertRowsAt,
  insertRowsAtSelection,
  selectionRowIndex,
} from './useRowCommands';
import {
  deleteGroupRow,
  deleteRowsWithGroupPrompt,
  isBeginRow,
  unwrapGroupRow,
} from './useGroupCommands';

const scrollMemory = new Map<string, { tx: number; ty: number }>();

export interface SheetGridProps {
  sheetName: ManagedSheetName;
  config: SheetGridConfig;
  /** Real sheet rows to show instead of the whole sheet (Choices Drawer). */
  rowIndexes?: readonly number[];
  /** Restrict/reorder data columns (Choices Drawer hides list_name). */
  columnKeys?: readonly ColumnKey[];
  /** Custom edit pipeline; defaults to a store `setCells` apply. */
  onCommitEdits?: (edits: readonly CellEdit[]) => void;
  /** Custom paste pipeline (drawer bulk insert). */
  onPasteMatrix?: (targetVisibleRow: number, matrix: string[][]) => boolean;
  /** Custom trailing-row append; returns the new row id. */
  onAppendRow?: () => RowId | null;
  /** Row drag reorder (drawer only); indexes are visible row indexes. */
  onMoveRow?: (fromVisible: number, toVisible: number) => void;
  /** Drawer delete action; defaults to the active sheet's row delete. */
  onDeleteRows?: () => void;
  onActiveRowChange?: (rowId: RowId) => void;
  /** Drawer mode: no toolbar, compact sizing. */
  compact?: boolean;
}

export function SheetGrid({
  sheetName,
  config,
  rowIndexes,
  columnKeys,
  onCommitEdits,
  onPasteMatrix,
  onAppendRow,
  onMoveRow,
  onDeleteRows,
  onActiveRowChange,
  compact = false,
}: SheetGridProps) {
  const data = useWorkbookStore((state) => state.data);
  const sheet = data[sheetName];
  const indexes = useDerivedStore((state) => state.indexes);
  const widths = useUiStore((state) => state.columnWidths[sheetName]);
  const hidden = useUiStore((state) => state.hiddenColumns[sheetName]);
  const collapsedGroupIds = useUiStore((state) => state.collapsedGroupIds);
  const flashRowId = useUiStore((state) => state.flashRowId);
  const reveal = useUiStore((state) => state.reveal);
  const activeCell = useUiStore((state) => state.activeCell);
  const themeMode = usePrefsStore((state) => state.theme);
  const dark = useIsDark(themeMode);
  const gridTheme = useMemo(() => buildGridTheme(dark), [dark]);
  const provideEditor = useEditorRouting();

  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const storedGridSelection = useUiStore((state) => state.gridSelections[sheetName]);
  const fallbackGridSelection = useMemo(() => gridSelectionForCell(1, 0), []);
  const [rowMenu, setRowMenu] = useState<RowContextMenuState | null>(null);
  const [headerMenu, setHeaderMenu] = useState<HeaderMenuState | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  const viewSheet = useMemo(
    () => (columnKeys ? { ...sheet, columns: [...columnKeys] } : sheet),
    [columnKeys, sheet],
  );
  const display = useMemo(
    () => buildDisplayColumns(viewSheet, config, { widths, hidden }),
    [viewSheet, config, widths, hidden],
  );
  const projection = useMemo(() => {
    if (rowIndexes) {
      const realIndexes = Int32Array.from(rowIndexes);
      const visibleIndexes = new Int32Array(sheet.rows.length).fill(-1);
      rowIndexes.forEach((real, visible) => {
        visibleIndexes[real] = visible;
      });
      return { realIndexes, visibleIndexes } as RowProjection;
    }
    if (sheetName === 'survey') {
      return buildProjection(sheet, { groups: indexes.groups, collapsed: collapsedGroupIds });
    }
    return identityProjection(sheet);
  }, [collapsedGroupIds, indexes.groups, rowIndexes, sheet, sheetName]);
  const rowCount = rowIndexes?.length ?? visibleRowCount(projection);
  const gridSelection = useMemo(() => {
    if (!storedGridSelection || rowCount === 0) return fallbackGridSelection;
    const range = storedGridSelection.current?.range;
    if (range && (range.y >= rowCount || range.x >= display.columns.length)) {
      return fallbackGridSelection;
    }
    return storedGridSelection;
  }, [display.columns.length, fallbackGridSelection, rowCount, storedGridSelection]);

  const setGridSelection = useCallback(
    (selection: GridSelection) => useUiStore.getState().setGridSelection(sheetName, selection),
    [sheetName],
  );
  const typeKey = findColumnKey(sheet, 'type') ?? 'type';
  const listNameKey =
    sheetName === 'choices' ? (findColumnKey(sheet, 'list_name') ?? 'list_name') : undefined;

  const orphanRows = useMemo(
    () => (sheetName === 'survey' ? new Set(indexes.groups.orphans) : new Set<string>()),
    [indexes.groups.orphans, sheetName],
  );

  const clipboard = useClipboard(sheetName, display.keys, gridSelection, projection);
  const cellCache = useRef(new WeakMap<object, Map<ColumnKey, GridCell>>());
  const handledReveal = useRef(0);

  // Resize observer: Glide needs explicit pixel dimensions.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Restore the per-sheet scroll position once the canvas has a size.
  useEffect(() => {
    if (size.width === 0) return;
    const memory = scrollMemory.get(compact ? `${sheetName}:drawer` : sheetName);
    if (!memory) return;
    gridRef.current?.scrollTo({ amount: memory.tx, unit: 'px' }, { amount: memory.ty, unit: 'px' });
  }, [compact, sheetName, size.width]);

  // Restore the active cell when the columns change or the sheet mounts.
  const keySignature = display.keys.join('\u0000');
  useEffect(() => {
    const cell = useUiStore.getState().activeCells[sheetName];
    const rowIndex = cell ? visibleRowIndex(projection, findRowIndex(sheet, cell.rowId)) : -1;
    const columnIndex = cell ? display.keys.indexOf(cell.column) + 1 : -1;
    if (rowIndex >= 0 && columnIndex > 0) {
      setGridSelection(gridSelectionForCell(columnIndex, rowIndex));
    } else if (rowCount > 0) {
      setGridSelection(gridSelectionForCell(Math.min(1, display.keys.length), 0));
    }
    // Only react to a changed column signature; edits must not reset selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature, sheetName, setGridSelection]);

  // Reveal expands collapsed ancestors before scrolling to the row (Task 3.7).
  useEffect(() => {
    if (!reveal || reveal.sheet !== sheetName || reveal.nonce === handledReveal.current) return;
    handledReveal.current = reveal.nonce;
    const realIndex = findRowIndex(sheet, reveal.rowId);
    if (realIndex < 0) return;

    const ancestors = indexes.groups.groups
      .filter((group) => {
        const end = group.endRowIndex < 0 ? Number.POSITIVE_INFINITY : group.endRowIndex;
        return realIndex >= group.startRowIndex && realIndex <= end;
      })
      .map((group) => group.id);
    const expanded = new Set(collapsedGroupIds);
    for (const id of ancestors) expanded.delete(id);
    const expandedProjection =
      sheetName === 'survey'
        ? buildProjection(sheet, { groups: indexes.groups, collapsed: expanded })
        : projection;
    const visibleIndex = visibleRowIndex(expandedProjection, realIndex);
    if (visibleIndex < 0) return;
    if (ancestors.some((id) => collapsedGroupIds.has(id))) {
      useUiStore.getState().expandGroups(ancestors);
    }

    const columnIndex = Math.max(1, display.keys.indexOf(activeCell?.column ?? '') + 1);
    setGridSelection(gridSelectionForCell(columnIndex, visibleIndex));
    useUiStore.getState().setActiveCell({
      sheet: sheetName,
      rowId: reveal.rowId,
      column: display.keys[columnIndex - 1] ?? '',
    });
    gridRef.current?.scrollTo(
      { amount: 0, unit: 'px' },
      { amount: visibleIndex, unit: 'cell' },
      'vertical',
      0,
      4,
    );
    gridRef.current?.focus();
  }, [
    reveal,
    sheetName,
    sheet,
    display.keys,
    activeCell?.column,
    collapsedGroupIds,
    indexes.groups,
    projection,
    setGridSelection,
  ]);

  const groupByRowId = useMemo(
    () => new Map(indexes.groups.groups.map((group) => [group.id, group])),
    [indexes.groups.groups],
  );
  const primaryLabelKey = useMemo(() => {
    const labels = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
    return labels.find((column) => !resolveColumn(column).language) ?? labels[0];
  }, [sheet.columns]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [columnIndex, visibleRow] = cell;
      const real = realRowIndex(projection, visibleRow);
      const row = real >= 0 ? sheet.rows[real] : undefined;
      if (!row) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      const typeValue = row.cells[typeKey] ?? '';
      if (columnIndex === 0) {
        const rowKind = structuralRowKind(typeValue);
        const group = groupByRowId.get(row.id);
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          copyData: '',
          data: {
            kind: 'xlsform-gutter',
            depth: sheetName === 'survey' ? (indexes.groups.depthByRowIndex[real] ?? 0) : 0,
            rowKind,
            orphan: orphanRows.has(row.id),
            collapsed: collapsedGroupIds.has(row.id),
            canCollapse: Boolean(group && group.endRowIndex >= 0),
            rowId: row.id,
          },
        };
      }

      const key = display.keys[columnIndex - 1];
      if (key === undefined) return { kind: GridCellKind.Loading, allowOverlay: false };
      const columnBase: ColumnBase = resolveColumn(key).base;

      const group = groupByRowId.get(row.id);
      const isCollapsedHeader =
        sheetName === 'survey' &&
        group !== undefined &&
        group.endRowIndex >= 0 &&
        collapsedGroupIds.has(row.id) &&
        key === primaryLabelKey;
      if (isCollapsedHeader && group) {
        return makeCollapsedPillCell({
          label: row.cells[key] ?? '',
          count: groupHiddenQuestionCount(sheet, group),
          rowId: row.id,
        });
      }

      if (columnBase === 'type' || columnBase === 'appearance') {
        const parsed = parseType(typeValue);
        const choices = parsed.listName ? indexes.choices.byList[parsed.listName] : undefined;
        return makeEnumCell({
          column: columnBase,
          value: row.cells[key] ?? '',
          rowId: row.id,
          baseType: parsed.base,
          ...(columnBase === 'type' && parsed.listName
            ? { choiceCount: choices?.length ?? 0 }
            : {}),
        });
      }

      if (sheetName === 'choices' && onCommitEdits && columnBase === 'name') {
        return makeChoiceNameCell({
          value: row.cells[key] ?? '',
          locked: row.meta?.nameLocked === true,
          rowId: row.id,
        });
      }

      let cache = cellCache.current.get(row);
      if (!cache) {
        cache = new Map();
        cellCache.current.set(row, cache);
      }
      const cached = cache.get(key);
      if (cached) return cached;

      const kind = structuralRowKind(typeValue);
      const built = textCell(cellValue(sheet, real, key), {
        readonly: !isCellEditable(typeValue, key),
        faded: kind === 'end_group' || kind === 'end_repeat',
      });
      cache.set(key, built);
      return built;
    },
    [
      collapsedGroupIds,
      display.keys,
      groupByRowId,
      indexes.choices.byList,
      indexes.groups.depthByRowIndex,
      onCommitEdits,
      orphanRows,
      primaryLabelKey,
      projection,
      sheet,
      sheetName,
      typeKey,
    ],
  );

  const getRowThemeOverride = useCallback(
    (visibleRow: number): Partial<Theme> | undefined => {
      const real = realRowIndex(projection, visibleRow);
      const row = real >= 0 ? sheet.rows[real] : undefined;
      if (!row) return undefined;
      const typeValue = row.cells[typeKey] ?? '';
      const kind: StructuralRowKind = structuralRowKind(typeValue);
      let style: RowStyleKind = null;
      if (row.id === flashRowId) {
        return { bgCell: dark ? '#334155' : '#dbeafe' };
      }
      if (orphanRows.has(row.id)) style = 'orphan';
      else if (kind === 'begin_group') style = 'group';
      else if (kind === 'begin_repeat') style = 'repeat';
      else if (kind === 'end_group' || kind === 'end_repeat') style = 'end';
      else if (listNameKey) {
        const current = row.cells[listNameKey] ?? '';
        const previous = real > 0 ? (sheet.rows[real - 1]?.cells[listNameKey] ?? '') : '';
        if (real > 0 && current !== previous) style = 'choice-boundary';
      }
      return rowThemeOverride(gridTheme, dark, style);
    },
    [dark, flashRowId, gridTheme, listNameKey, orphanRows, projection, sheet, typeKey],
  );

  const commitEdits = useCallback(
    (items: readonly { location: Item; value: EditableGridCell }[]) => {
      const edits: CellEdit[] = [];
      const rowIds = new Set<string>();
      for (const { location, value } of items) {
        const [columnIndex, visibleRow] = location;
        if (columnIndex <= 0) continue;
        const key = columnKeyAt(display, columnIndex);
        const real = realRowIndex(projection, visibleRow);
        const row = real >= 0 ? sheet.rows[real] : undefined;
        if (!key || !row) continue;
        if (!isCellEditable(row.cells[typeKey] ?? '', key)) continue;
        const text = editValueText(value);
        if ((row.cells[key] ?? '') === text) continue;
        edits.push({ rowId: row.id, column: key, value: text });
        rowIds.add(row.id);
      }
      if (edits.length === 0) return;
      if (onCommitEdits) {
        onCommitEdits(edits);
        return;
      }
      useWorkbookStore.getState().apply(
        `Edit ${edits.length} cell${edits.length === 1 ? '' : 's'}`,
        (current) => {
          let next = setCells(current, sheetName, edits);
          if (sheetName === 'survey') {
            for (const edit of edits) {
              if (resolveColumn(edit.column).base === 'type') {
                next = applyTypeChange(next, edit.rowId, edit.value);
              }
            }
          }
          return next;
        },
        { sheet: sheetName, rowIds: [...rowIds] },
      );
    },
    [display, onCommitEdits, projection, sheet, sheetName, typeKey],
  );

  const onCellsEdited = useCallback<NonNullable<DataEditorProps['onCellsEdited']>>(
    (items) => {
      commitEdits(items);
      return true;
    },
    [commitEdits],
  );

  const onPaste = useCallback(
    (target: Item, values: readonly (readonly string[])[]): boolean => {
      const matrix = values.map((row) => [...row]);
      if (matrix.length === 0) return false;
      if (onPasteMatrix) {
        // The drawer applied the bulk insert in one store action.
        onPasteMatrix(target[1], matrix);
        return false;
      }
      let result: ReturnType<typeof pasteMatrix> | undefined;
      const cellCount = matrix.reduce((total, row) => total + row.length, 0);
      useWorkbookStore.getState().apply(
        `Paste ${cellCount} cell${cellCount === 1 ? '' : 's'}`,
        (current) => {
          result = pasteMatrix(
            current,
            sheetName,
            { rowIndex: target[1], columnIndex: Math.max(0, target[0] - 1) },
            matrix,
            display.keys,
            { rowIndexes: projection.realIndexes },
          );
          return result.data;
        },
        { sheet: sheetName },
      );
      if (result?.droppedColumns) {
        toast.warning(`Dropped ${result.droppedColumns} column(s) past the last column.`);
      }
      if (result?.skippedReadOnly) {
        toast.warning(`Skipped ${result.skippedReadOnly} read-only cell(s).`);
      }
      // We already applied the paste in one store action.
      return false;
    },
    [display.keys, onPasteMatrix, projection.realIndexes, sheetName],
  );

  const onFillPattern = useCallback<NonNullable<DataEditorProps['onFillPattern']>>(
    (event) => {
      event.preventDefault();
      const source = event.patternSource;
      const destination = event.fillDestination;
      const sourceKeys = selectionColumnKeysForRange(display.keys, source);
      const rowIndexes = Array.from({ length: source.height }, (_, offset) =>
        realRowIndex(projection, source.y + offset),
      );
      const sourceMatrix = rowIndexes.map((real) =>
        sourceKeys.map((key) => (real >= 0 ? (sheet.rows[real]?.cells[key] ?? '') : '')),
      );
      const matrix = tileFill(sourceMatrix, destination.height, destination.width);
      let result: ReturnType<typeof pasteMatrix> | undefined;
      useWorkbookStore.getState().apply(
        `Fill ${destination.width}×${destination.height} cells`,
        (current) => {
          result = pasteMatrix(
            current,
            sheetName,
            {
              rowIndex: destination.y,
              columnIndex: Math.max(0, destination.x - 1),
            },
            matrix,
            display.keys,
            { rowIndexes: projection.realIndexes },
          );
          return result.data;
        },
        { sheet: sheetName },
      );
      if (result?.skippedReadOnly) {
        toast.warning(`Skipped ${result.skippedReadOnly} read-only cell(s).`);
      }
    },
    [display.keys, projection, sheet.rows, sheetName],
  );

  const onRowAppended = useCallback<NonNullable<DataEditorProps['onRowAppended']>>(async () => {
    if (onAppendRow) {
      const rowId = onAppendRow();
      if (rowId) useUiStore.getState().setSelectedRowIds([rowId]);
      return 'bottom' as const;
    }
    let rowId: string | undefined;
    useWorkbookStore.getState().apply(
      'Add row',
      (current) => {
        const next = insertRows(current, sheetName, current[sheetName].rows.length, [
          { cells: {} },
        ]);
        rowId = next[sheetName].rows.at(-1)?.id;
        return next;
      },
      { sheet: sheetName },
    );
    if (rowId) useUiStore.getState().setSelectedRowIds([rowId]);
    return 'bottom' as const;
  }, [onAppendRow, sheetName]);

  const onColumnResize = useCallback<NonNullable<DataEditorProps['onColumnResizeEnd']>>(
    (_column, newSize, columnIndex) => {
      const key = display.keys[columnIndex - 1];
      if (!key) return;
      useUiStore.getState().setColumnWidth(sheetName, key, newSize);
    },
    [display.keys, sheetName],
  );

  const handleSelectionChange = useCallback(
    (selection: GridSelection) => {
      setGridSelection(selection);
      const bounds = selectionBounds(selection);
      if (bounds) {
        const ref = refFromItem(sheet, display.keys, [bounds.x, bounds.y], sheetName, projection);
        const rangeSelection = selectionFromRange(
          sheet,
          display.keys,
          bounds,
          sheetName,
          projection,
        );
        if (ref) useUiStore.getState().setActiveCell(ref);
        if (rangeSelection) useUiStore.getState().setSelection(rangeSelection);
        if (ref) {
          onActiveRowChange?.(ref.rowId);
          if (sheetName === 'survey') useUiStore.getState().setDrawerRow(ref.rowId);
        }
      }
      useUiStore.getState().setSelectedRowIds(selectionToRowIds(sheet, selection, projection));
    },
    [display.keys, onActiveRowChange, projection, setGridSelection, sheet, sheetName],
  );

  const openRowMenu = useCallback(
    (item: Item, clientX: number, clientY: number) => {
      const real = realRowIndex(projection, item[1]);
      const row = real >= 0 ? sheet.rows[real] : undefined;
      if (!row) return;
      const ref = refFromItem(
        sheet,
        display.keys,
        [Math.max(1, item[0]), item[1]],
        sheetName,
        projection,
      );
      if (ref) useUiStore.getState().setActiveCell(ref);
      const existing = useUiStore.getState().selectedRowIds;
      if (!existing.includes(row.id)) useUiStore.getState().setSelectedRowIds([row.id]);
      setRowMenu({ x: clientX, y: clientY, rowId: row.id });
    },
    [display.keys, projection, sheet, sheetName],
  );

  const hostPoint = (localX: number, localY: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: (rect?.left ?? 0) + localX, y: (rect?.top ?? 0) + localY };
  };

  const activeTarget = () => {
    const current = gridSelection.current;
    return {
      rowIndex: current?.cell[1] ?? 0,
      columnIndex: Math.max(0, (current?.cell[0] ?? 1) - 1),
    };
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid={compact ? 'drawer-grid' : `sheet-grid-${sheetName}`}
    >
      {compact ? null : (
        <div className="text-muted-foreground flex items-center gap-2 border-b px-2 py-1 text-xs">
          <span className="font-medium">{sheetName}</span>
          <span>{sheet.rows.length} rows</span>
          <span>{sheet.columns.length} columns</span>
          <div className="ml-auto flex items-center gap-1">
            {hidden && hidden.size > 0 ? (
              <button
                type="button"
                className="hover:bg-accent rounded px-2 py-0.5"
                onClick={() => useUiStore.getState().showAllColumns(sheetName)}
              >
                {hidden.size} hidden — show all
              </button>
            ) : null}
            <button
              type="button"
              className="hover:bg-accent rounded px-2 py-0.5"
              data-testid="add-column-button"
              onClick={() => setAddColumnOpen(true)}
            >
              + Column
            </button>
          </div>
        </div>
      )}

      <div ref={hostRef} className="relative min-h-0 flex-1">
        <DataEditor
          ref={gridRef}
          width={size.width}
          height={size.height}
          rows={rowCount}
          columns={display.columns}
          getCellContent={getCellContent}
          getRowThemeOverride={getRowThemeOverride}
          onCellsEdited={onCellsEdited}
          onDelete={() => {
            const rowIds = useUiStore.getState().selectedRowIds;
            if (rowIds.length === 0) return true;
            if (onDeleteRows) {
              onDeleteRows();
              return false;
            }
            deleteRowsWithGroupPrompt(rowIds);
            // The row delete already happened; suppress Glide's cell clear.
            return false;
          }}
          onPaste={onPaste}
          onFillPattern={onFillPattern}
          onRowAppended={onRowAppended}
          onRowMoved={onMoveRow}
          onGridSelectionChange={handleSelectionChange}
          gridSelection={gridSelection}
          provideEditor={provideEditor}
          onVisibleRegionChanged={(_range, tx, ty) => {
            scrollMemory.set(compact ? `${sheetName}:drawer` : sheetName, { tx, ty });
          }}
          onColumnResizeEnd={onColumnResize}
          onHeaderContextMenu={(columnIndex, event) => {
            if (compact) return;
            const key = display.keys[columnIndex - 1];
            if (!key) return;
            event.preventDefault();
            const point = hostPoint(event.localEventX, event.localEventY);
            setHeaderMenu({ x: point.x, y: point.y, column: key });
          }}
          onCellContextMenu={(item, event) => {
            if (item[1] < 0) return;
            event.preventDefault();
            const point = hostPoint(event.localEventX, event.localEventY);
            openRowMenu(item[0] <= 0 ? [1, item[1]] : item, point.x, point.y);
          }}
          trailingRowOptions={{
            tint: true,
            hint: 'New row',
            sticky: false,
            targetColumn: Math.min(1, display.keys.length),
          }}
          freezeColumns={display.frozenCount}
          rowMarkers="number"
          rowHeight={GRID_ROW_HEIGHT}
          headerHeight={GRID_HEADER_HEIGHT}
          theme={gridTheme}
          customRenderers={[
            gutterRenderer,
            enumRenderer,
            choiceNameRenderer,
            collapsedPillRenderer,
          ]}
          cellActivationBehavior="second-click"
          fillHandle={true}
          getCellsForSelection={true}
          keybindings={{ search: false }}
          smoothScrollX={true}
          smoothScrollY={true}
        />
      </div>

      <RowContextMenu
        state={rowMenu}
        onClose={() => setRowMenu(null)}
        compact={compact}
        actions={{
          insertAbove: () => insertRowsAtSelection('above'),
          insertBelow: () => insertRowsAtSelection('below'),
          insertMany: () => {
            const raw = window.prompt('How many rows?', '1');
            const count = Number(raw);
            if (!Number.isFinite(count) || count < 1) return;
            insertRowsAt(selectionRowIndex(), Math.min(500, Math.trunc(count)));
          },
          duplicate: () => duplicateSelectedRows(),
          deleteRows: () => {
            if (onDeleteRows) onDeleteRows();
            else deleteSelectedRows();
          },
          copy: () => {
            void clipboard.copy();
          },
          cut: () => {
            void clipboard.cut();
          },
          paste: () => {
            void clipboard.paste(activeTarget());
          },
          ...(sheetName === 'survey' && isBeginRow(rowMenu?.rowId)
            ? {
                group: {
                  unwrap: () => {
                    if (rowMenu?.rowId) unwrapGroupRow(rowMenu.rowId);
                  },
                  deleteWithContents: () => {
                    if (rowMenu?.rowId) deleteGroupRow(rowMenu.rowId);
                  },
                },
              }
            : {}),
        }}
      />

      {compact ? null : (
        <>
          <HeaderMenu sheet={sheetName} state={headerMenu} onClose={() => setHeaderMenu(null)} />
          <AddColumnDialog open={addColumnOpen} onOpenChange={setAddColumnOpen} sheet={sheetName} />
        </>
      )}
    </div>
  );
}

/** Data columns covered by a fill range, excluding the gutter. */
function selectionColumnKeysForRange(keys: readonly ColumnKey[], range: Rectangle): ColumnKey[] {
  const skipped = range.x <= 0;
  const start = skipped ? 0 : range.x - 1;
  const count = Math.max(0, range.width - (skipped ? 1 : 0));
  return keys.slice(start, start + count);
}
