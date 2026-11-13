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
import { buildGroupTree } from '@/core/indexes/groupTree';
import { primaryLabelColumn } from '@/core/languages/discover';
import { splitPair, untranslatedCellKeys, visibleColumns } from '@/core/languages/viewModes';
import { diagnosticCellKey } from '@/core/lint/diagnostics';
import type { DiagnosticIssue } from '@/core/lint';
import { isCellModified, rowChange } from '@/core/ai/diff';
import type { ColumnBase } from '@/core/model/columns';
import { resolveColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import type { ColumnKey, ManagedSheetName, RowId } from '@/core/model/types';
import type { CellEdit } from '@/core/ops/cells';
import { groupHiddenQuestionCount } from '@/core/ops/groups';
import { insertRows } from '@/core/ops/rows';
import { modeFromStyle } from '@/core/slug/slugify';
import { applyCellEdits, type CellEditOutcome } from '@/features/grid/cellEditPipeline';
import { notifyCellEdits } from '@/features/shell/toasts';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { selectReviewPending, useStagingStore } from '@/state/stagingStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';
import { useIsDark } from '@/lib/theme';

import { cellValue, editValueText, textCell } from './cells/cellContent';
import { makeChoiceNameCell, choiceNameRenderer } from './cells/ChoiceNameCell';
import { makeCollapsedPillCell, collapsedPillRenderer } from './cells/CollapsedPillCell';
import { makeEnumCell, enumRenderer } from './cells/EnumCell';
import { gutterRenderer, makeGutterCell, structuralToGutterKind } from './cells/GutterCell';
import { makeXPathCell, xpathRenderer } from './cells/XPathCell';
import {
  buildDisplayColumns,
  columnKeyAt,
  moveDisplayColumn,
  type SheetGridConfig,
} from './columns';
import { pasteMatrix } from './clipboard';
import { isCellEditable, structuralRowKind, type StructuralRowKind } from './editability';
import { useEditorRouting } from './editors/useEditorRouting';
import { tileFill } from './fill';
import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from './geometry';
import { buildGroupRails } from './groupRails';
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
import { rowThemeOverride, translationCellTheme, type RowStyleKind } from './rowStyles';
import {
  gridSelectionForCell,
  refFromItem,
  selectionBounds,
  selectionFromRange,
  selectionToRowIds,
  findRowIndex,
} from './selection';
import { mergedSheet } from './stagingView';
import {
  buildGridTheme,
  GROUP_RAIL_COLORS,
  stagingCellTheme,
  stagingModifiedRowTheme,
  stagingRowTheme,
} from './theme';
import { useClipboard } from './useClipboard';
import {
  deleteSelectedRows,
  duplicateSelectedRows,
  insertRowsAt,
  insertRowsAtSelection,
  selectionRowIndex,
} from './useRowCommands';
import { deleteGroupRow, isBeginRow, unwrapGroupRow } from './useGroupCommands';

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
  const liveData = useWorkbookStore((state) => state.data);
  const stagedBase = useStagingStore((state) => state.base);
  const stagedDraft = useStagingStore((state) => state.draft);
  const stagedDiff = useStagingStore((state) => state.diff);
  const reviewPending = useStagingStore(selectReviewPending);
  const data = stagedDraft ?? liveData;
  // Deleted rows stay visible at their original positions while staged.
  const sourceSheet = data[sheetName];
  const sheet = useMemo(
    () =>
      stagedBase && stagedDraft && stagedDiff
        ? mergedSheet(stagedBase[sheetName], stagedDraft[sheetName], stagedDiff[sheetName])
        : sourceSheet,
    [sheetName, sourceSheet, stagedBase, stagedDiff, stagedDraft],
  );
  const locked = stagedDraft !== null;
  const indexes = useDerivedStore((state) => state.indexes);
  const diagnosticIndex = useDerivedStore((state) => state.diagnosticIndex);
  const cellPreview = useUiStore((state) => state.cellPreview);
  const widths = useUiStore((state) => state.columnWidths[sheetName]);
  const storedOrder = useUiStore((state) => state.columnOrder[sheetName]);
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
  const [diagnosticHover, setDiagnosticHover] = useState<{
    x: number;
    y: number;
    issues: readonly DiagnosticIssue[];
  } | null>(null);

  const viewSheet = useMemo(
    () => (columnKeys ? { ...sheet, columns: [...columnKeys] } : sheet),
    [columnKeys, sheet],
  );
  const languageView = useUiStore((state) => state.languageView);
  const languages = useDerivedStore((state) => state.languages);
  // Language view filtering is display-only: `sheet.columns` (and export) keep
  // every column (Task 5.4). The drawer passes explicit `columnKeys` instead.
  const view = useMemo(
    () =>
      columnKeys || sheetName === 'settings'
        ? null
        : visibleColumns(sheetName, viewSheet.columns, languages, languageView),
    [columnKeys, languages, languageView, sheetName, viewSheet.columns],
  );
  const display = useMemo(
    () =>
      buildDisplayColumns(viewSheet, config, {
        widths,
        hidden,
        // The drawer's explicit columnKeys are ordered by the caller.
        order: columnKeys ? undefined : storedOrder,
        ...(view ? { keys: view.columns, frozen: view.frozen } : {}),
        ...(compact ? { gutterWidth: 48 } : {}),
      }),
    [columnKeys, compact, config, hidden, storedOrder, view, viewSheet, widths],
  );
  const untranslated = useMemo(() => {
    if (!view || languageView.mode !== 'split') return new Set<string>();
    const { source, target } = splitPair(languages, languageView);
    return untranslatedCellKeys(sheet, languages, source?.id, target?.id);
  }, [languageView, languages, sheet, view]);
  const projection = useMemo(() => {
    const groups = stagedDraft && sheetName === 'survey' ? buildGroupTree(sheet) : indexes.groups;
    if (rowIndexes) {
      const realIndexes = Int32Array.from(rowIndexes);
      const visibleIndexes = new Int32Array(sheet.rows.length).fill(-1);
      rowIndexes.forEach((real, visible) => {
        visibleIndexes[real] = visible;
      });
      return { realIndexes, visibleIndexes } as RowProjection;
    }
    if (sheetName === 'survey') {
      return buildProjection(sheet, { groups, collapsed: collapsedGroupIds });
    }
    return identityProjection(sheet);
  }, [collapsedGroupIds, indexes.groups, rowIndexes, sheet, sheetName, stagedDraft]);
  const rowCount = rowIndexes?.length ?? visibleRowCount(projection);
  const groupsForDepth = useMemo(
    () => (stagedDraft && sheetName === 'survey' ? buildGroupTree(sheet) : indexes.groups),
    [indexes.groups, sheet, sheetName, stagedDraft],
  );
  const railPalette = dark ? GROUP_RAIL_COLORS.dark : GROUP_RAIL_COLORS.light;
  const railsByRealRow = useMemo(
    () => (sheetName === 'survey' ? buildGroupRails(sheet, groupsForDepth, railPalette) : []),
    [groupsForDepth, railPalette, sheet, sheetName],
  );
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
    () => (sheetName === 'survey' ? new Set(groupsForDepth.orphans) : new Set<string>()),
    [groupsForDepth.orphans, sheetName],
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

    const ancestors = groupsForDepth.groups
      .filter((group) => {
        const end = group.endRowIndex < 0 ? Number.POSITIVE_INFINITY : group.endRowIndex;
        return realIndex >= group.startRowIndex && realIndex <= end;
      })
      .map((group) => group.id);
    const expanded = new Set(collapsedGroupIds);
    for (const id of ancestors) expanded.delete(id);
    const expandedProjection =
      sheetName === 'survey'
        ? buildProjection(sheet, { groups: groupsForDepth, collapsed: expanded })
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
    if (reveal.focus !== false) gridRef.current?.focus();
  }, [
    reveal,
    sheetName,
    sheet,
    display.keys,
    activeCell?.column,
    collapsedGroupIds,
    groupsForDepth,
    projection,
    setGridSelection,
  ]);

  const groupByRowId = useMemo(
    () => new Map(groupsForDepth.groups.map((group) => [group.id, group])),
    [groupsForDepth.groups],
  );

  // Diagnostics draw through `drawCell`; damage the affected rows so markers
  // and gutter dots appear even when only the lint result changed.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || diagnosticIndex.byRow.size === 0) return;
    const cells: Array<{ cell: Item }> = [];
    for (const rowId of diagnosticIndex.byRow.keys()) {
      const visible = visibleRowIndex(projection, findRowIndex(sheet, rowId));
      if (visible < 0) continue;
      for (let column = 0; column <= display.keys.length; column += 1) {
        cells.push({ cell: [column, visible] });
      }
    }
    if (cells.length > 0) grid.updateCells(cells);
  }, [diagnosticIndex, display.keys.length, projection, sheet]);

  // Formula-bar previews are UI-only overrides; damage that cell to repaint it.
  useEffect(() => {
    if (!cellPreview || cellPreview.sheet !== sheetName) return;
    const grid = gridRef.current;
    if (!grid) return;
    const visible = visibleRowIndex(projection, findRowIndex(sheet, cellPreview.rowId));
    const column = display.keys.indexOf(cellPreview.column) + 1;
    if (visible < 0 || column <= 0) return;
    grid.updateCells([{ cell: [column, visible] }]);
  }, [cellPreview, display.keys, projection, sheet, sheetName]);
  const primaryLabelKey = useMemo(() => primaryLabelColumn(sheet, data), [sheet, data]);

  // Columns touched by the staged draft, for the header underline.
  const stagedChangedColumns = useMemo(() => {
    const columns = new Set<ColumnKey>();
    if (!stagedDiff) return columns;
    const sheetDiff = stagedDiff[sheetName];
    for (const cellKey of sheetDiff.cells) {
      const column = cellKey.slice(cellKey.indexOf('\u0000') + 1);
      if (column) columns.add(column);
    }
    for (const [rowId, kind] of sheetDiff.rows) {
      if (kind === 'modified') continue;
      const row = sheet.rows.find((candidate) => candidate.id === rowId);
      if (!row) continue;
      for (const [column, value] of Object.entries(row.cells)) {
        if (value.trim()) columns.add(column);
      }
    }
    return columns;
  }, [sheet.rows, sheetName, stagedDiff]);

  const drawStagedHeader = useCallback<NonNullable<DataEditorProps['drawHeader']>>(
    (args, draw) => {
      draw();
      if (!stagedDiff) return;
      const key = display.keys[args.columnIndex - 1];
      if (!key || !stagedChangedColumns.has(key)) return;
      args.ctx.save();
      args.ctx.fillStyle = dark ? 'rgba(251, 191, 36, 0.95)' : 'rgba(217, 119, 6, 0.9)';
      args.ctx.fillRect(args.rect.x, args.rect.y + args.rect.height - 2, args.rect.width, 2);
      args.ctx.restore();
    },
    [dark, display.keys, stagedChangedColumns, stagedDiff],
  );

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
        const rowKind = structuralToGutterKind(structuralRowKind(typeValue));
        const group = groupByRowId.get(row.id);
        const counts = diagnosticIndex.byRow.get(row.id);
        const rails = railsByRealRow[real];
        return makeGutterCell({
          // The drawer's own 48 px gutter has no number slot: Glide's marker
          // column already shows the row number there.
          ...(compact ? {} : { rowNumber: real + 1 }),
          depth: sheetName === 'survey' ? (groupsForDepth.depthByRowIndex[real] ?? 0) : 0,
          rowKind,
          orphan: orphanRows.has(row.id),
          collapsed: collapsedGroupIds.has(row.id),
          canCollapse: Boolean(group && group.endRowIndex >= 0),
          rowId: row.id,
          ...(rails && rails.length > 0 ? { rails } : {}),
          ...(counts
            ? {
                diagnosticSeverity:
                  counts.errors > 0 ? 'error' : counts.warnings > 0 ? 'warning' : undefined,
              }
            : {}),
        });
      }

      const key = display.keys[columnIndex - 1];
      if (key === undefined) return { kind: GridCellKind.Loading, allowOverlay: false };
      const columnBase: ColumnBase = resolveColumn(key).base;

      const preview =
        cellPreview &&
        cellPreview.sheet === sheetName &&
        cellPreview.rowId === row.id &&
        cellPreview.column === key
          ? cellPreview.value
          : undefined;
      if (preview !== undefined) {
        return resolveColumn(key).isXPath
          ? makeXPathCell({ value: preview, rowId: row.id, column: key })
          : textCell(preview);
      }

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

      if (resolveColumn(key).isXPath) {
        const structural = structuralRowKind(typeValue);
        return makeXPathCell({
          value: row.cells[key] ?? '',
          rowId: row.id,
          column: key,
          readonly: locked || !isCellEditable(typeValue, key),
          faded: structural === 'end_group' || structural === 'end_repeat',
        });
      }

      if (sheetName === 'choices' && onCommitEdits && columnBase === 'name') {
        return makeChoiceNameCell({
          value: row.cells[key] ?? '',
          locked: row.meta?.nameLocked === true,
          rowId: row.id,
        });
      }

      const needsTranslation = untranslated.has(`${row.id}\u0000${key}`);
      const modifiedCell = stagedDiff ? isCellModified(stagedDiff, sheetName, row.id, key) : false;
      let cache = cellCache.current.get(row);
      if (!cache) {
        cache = new Map();
        cellCache.current.set(row, cache);
      }
      if (!needsTranslation && !modifiedCell) {
        const cached = cache.get(key);
        if (cached) return cached;
      }

      const kind = structuralRowKind(typeValue);
      const built = textCell(cellValue(sheet, real, key), {
        readonly: locked || !isCellEditable(typeValue, key),
        faded: kind === 'end_group' || kind === 'end_repeat',
        ...(modifiedCell
          ? { themeOverride: stagingCellTheme(dark) }
          : needsTranslation
            ? { themeOverride: translationCellTheme(dark) }
            : {}),
      });
      if (!needsTranslation && !modifiedCell) cache.set(key, built);
      return built;
    },
    [
      cellPreview,
      collapsedGroupIds,
      compact,
      dark,
      diagnosticIndex,
      display.keys,
      groupByRowId,
      indexes.choices.byList,
      locked,
      groupsForDepth.depthByRowIndex,
      onCommitEdits,
      orphanRows,
      primaryLabelKey,
      projection,
      railsByRealRow,
      sheet,
      sheetName,
      stagedDiff,
      typeKey,
      untranslated,
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
      const change = stagedDiff ? rowChange(stagedDiff, sheetName, row.id) : undefined;
      if (change === 'inserted' || change === 'deleted') {
        return stagingRowTheme(gridTheme, dark, change);
      }
      if (change === 'modified') return stagingModifiedRowTheme(dark);
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
    [
      dark,
      flashRowId,
      gridTheme,
      listNameKey,
      orphanRows,
      projection,
      sheet,
      sheetName,
      stagedDiff,
      typeKey,
    ],
  );

  const commitEdits = useCallback(
    (items: readonly { location: Item; value: EditableGridCell }[]) => {
      if (locked) return;
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
      const { slugMaxLength, defaultSlugMode, listNamePattern } = usePrefsStore.getState();
      const choiceModes = useUiStore.getState().choiceModes;
      let outcome: CellEditOutcome | undefined;
      useWorkbookStore.getState().apply(
        `Edit ${edits.length} cell${edits.length === 1 ? '' : 's'}`,
        (current) => {
          outcome = applyCellEdits(current, sheetName, edits, {
            maxLength: slugMaxLength,
            choiceModes,
            defaultMode: modeFromStyle(defaultSlugMode),
            listNamePattern,
          });
          return outcome.data;
        },
        { sheet: sheetName, rowIds: [...rowIds] },
      );
      if (outcome) notifyCellEdits(outcome);
    },
    [display, locked, onCommitEdits, projection, sheet, sheetName, typeKey],
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
      if (locked) return true;
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
    [display.keys, locked, onPasteMatrix, projection.realIndexes, sheetName],
  );

  const onFillPattern = useCallback<NonNullable<DataEditorProps['onFillPattern']>>(
    (event) => {
      event.preventDefault();
      if (locked) return;
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
    [display.keys, locked, projection, sheet.rows, sheetName],
  );

  const onRowAppended = useCallback<NonNullable<DataEditorProps['onRowAppended']>>(async () => {
    if (locked) return 'bottom' as const;
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
  }, [locked, onAppendRow, sheetName]);

  // Widths are session UI prefs: live during the drag (rAF-throttled) and
  // persisted on release, never an undo entry.
  const pendingWidth = useRef<{ key: ColumnKey; width: number } | null>(null);
  const widthFrame = useRef<number | null>(null);
  const flushWidth = useCallback(() => {
    widthFrame.current = null;
    const pending = pendingWidth.current;
    pendingWidth.current = null;
    if (pending) useUiStore.getState().setColumnWidth(sheetName, pending.key, pending.width);
  }, [sheetName]);

  const onColumnResize = useCallback<NonNullable<DataEditorProps['onColumnResize']>>(
    (_column, newSize, columnIndex) => {
      const key = display.keys[columnIndex - 1];
      if (!key) return;
      pendingWidth.current = { key, width: newSize };
      if (widthFrame.current === null) widthFrame.current = requestAnimationFrame(flushWidth);
    },
    [display.keys, flushWidth],
  );

  const onColumnResizeEnd = useCallback<NonNullable<DataEditorProps['onColumnResizeEnd']>>(
    (_column, newSize, columnIndex) => {
      const key = display.keys[columnIndex - 1];
      if (!key) return;
      if (widthFrame.current !== null) cancelAnimationFrame(widthFrame.current);
      widthFrame.current = null;
      pendingWidth.current = null;
      useUiStore.getState().setColumnWidth(sheetName, key, newSize);
    },
    [display.keys, sheetName],
  );

  // Session-only display order (Category C4); the frozen block and the
  // scrollable block never trade columns, and the gutter is never a target.
  const onColumnMoved = useCallback<NonNullable<DataEditorProps['onColumnMoved']>>(
    (startIndex, endIndex) => {
      const next = moveDisplayColumn(display, startIndex, endIndex);
      if (!next) return;
      useUiStore.getState().setColumnOrder(sheetName, next);
    },
    [display, sheetName],
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

  // Glide's `bounds` already include the canvas offset (client coordinates) and
  // localEventX/Y are offsets inside the clicked cell, so their sum is the
  // pointer. Adding `hostRef`'s rect on top doubles that offset.
  const contextMenuPoint = (bounds: Rectangle, localX: number, localY: number) => ({
    x: bounds.x + localX,
    y: bounds.y + localY,
  });

  const activeTarget = () => {
    const current = gridSelection.current;
    return {
      rowIndex: current?.cell[1] ?? 0,
      columnIndex: Math.max(0, (current?.cell[0] ?? 1) - 1),
    };
  };

  const drawDiagnosticMarker = useCallback<NonNullable<DataEditorProps['drawCell']>>(
    (args, draw) => {
      draw();
      if (args.col <= 0) return;
      const real = realRowIndex(projection, args.row);
      const row = real >= 0 ? sheet.rows[real] : undefined;
      const key = display.keys[args.col - 1];
      if (!row || !key) return;
      if (stagedDiff) {
        const change = rowChange(stagedDiff, sheetName, row.id);
        if (change === 'deleted') {
          ctxStrike(args.ctx, args.rect);
        } else if (isCellModified(stagedDiff, sheetName, row.id, key)) {
          ctxUnderline(args.ctx, args.rect);
        }
      }
      const issues = diagnosticIndex.byCell.get(diagnosticCellKey(row.id, key));
      if (!issues || issues.length === 0) return;
      const error = issues.some((issue) => issue.severity === 'error');
      ctxMarker(args.ctx, args.rect, error ? '#dc2626' : '#d97706');
    },
    [diagnosticIndex.byCell, display.keys, projection, sheetName, sheet.rows, stagedDiff],
  );

  const hoverKey = useRef<string | null>(null);
  const handleDiagnosticHover = useCallback<NonNullable<DataEditorProps['onItemHovered']>>(
    (args) => {
      if (args.kind !== 'cell') {
        hoverKey.current = null;
        setDiagnosticHover(null);
        return;
      }
      const [columnIndex, visibleRow] = args.location;
      const real = realRowIndex(projection, visibleRow);
      const row = real >= 0 ? sheet.rows[real] : undefined;
      const key = columnIndex > 0 ? display.keys[columnIndex - 1] : undefined;
      if (!row || !key) {
        hoverKey.current = null;
        setDiagnosticHover(null);
        return;
      }
      const identity = diagnosticCellKey(row.id, key);
      if (identity === hoverKey.current) return;
      hoverKey.current = identity;
      const issues = diagnosticIndex.byCell.get(identity);
      setDiagnosticHover(
        issues && issues.length > 0 ? { x: args.localEventX, y: args.localEventY, issues } : null,
      );
    },
    [diagnosticIndex.byCell, display.keys, projection, sheet.rows],
  );

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
          {reviewPending ? (
            <span className="text-amber-700" data-testid="ai-staging-lock">
              Staged AI changes — Accept or Revert below
            </span>
          ) : null}
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
              className="hover:bg-accent rounded px-2 py-0.5 disabled:opacity-40"
              data-testid="add-column-button"
              disabled={locked}
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
          onItemHovered={handleDiagnosticHover}
          drawCell={drawDiagnosticMarker}
          drawHeader={drawStagedHeader}
          onDelete={() => !locked}
          onPaste={onPaste}
          onFillPattern={onFillPattern}
          onRowAppended={onRowAppended}
          onRowMoved={compact ? onMoveRow : undefined}
          onGridSelectionChange={handleSelectionChange}
          gridSelection={gridSelection}
          provideEditor={provideEditor}
          // The completion tooltip is mounted in `document.body`, outside this
          // overlay; without the veto Glide would treat a click on a completion
          // item as an outside click and close the in-cell editor first.
          isOutsideClick={(event) => {
            const target = event.target;
            return !(target instanceof Element && target.closest('.cm-tooltip') !== null);
          }}
          onVisibleRegionChanged={(_range, tx, ty) => {
            scrollMemory.set(compact ? `${sheetName}:drawer` : sheetName, { tx, ty });
          }}
          onColumnResize={onColumnResize}
          onColumnResizeEnd={onColumnResizeEnd}
          onColumnMoved={columnKeys ? undefined : onColumnMoved}
          onHeaderContextMenu={(columnIndex, event) => {
            if (compact) return;
            const key = display.keys[columnIndex - 1];
            if (!key) return;
            event.preventDefault();
            const point = contextMenuPoint(event.bounds, event.localEventX, event.localEventY);
            setHeaderMenu({ x: point.x, y: point.y, column: key });
          }}
          onCellContextMenu={(item, event) => {
            if (item[1] < 0) return;
            event.preventDefault();
            const point = contextMenuPoint(event.bounds, event.localEventX, event.localEventY);
            openRowMenu(item[0] <= 0 ? [1, item[1]] : item, point.x, point.y);
          }}
          trailingRowOptions={
            locked
              ? undefined
              : {
                  tint: true,
                  // Zero-width space, not '': Glide only always-draws the plus
                  // glyph when the hint is non-empty (new-row-cell.js).
                  hint: '\u200B',
                  sticky: false,
                  targetColumn: Math.min(1, display.keys.length),
                }
          }
          freezeColumns={display.frozenCount}
          rowMarkers={compact ? 'number' : 'none'}
          rowHeight={GRID_ROW_HEIGHT}
          headerHeight={GRID_HEADER_HEIGHT}
          theme={gridTheme}
          customRenderers={[
            gutterRenderer,
            enumRenderer,
            choiceNameRenderer,
            collapsedPillRenderer,
            xpathRenderer,
          ]}
          cellActivationBehavior="second-click"
          fillHandle={true}
          getCellsForSelection={true}
          keybindings={{ search: false }}
          smoothScrollX={true}
          smoothScrollY={true}
        />
        {diagnosticHover ? (
          <div
            className="bg-popover text-popover-foreground border-border pointer-events-none absolute z-50 max-w-xs rounded border px-2 py-1 text-[11px] shadow-lg"
            style={{ left: diagnosticHover.x + 12, top: diagnosticHover.y + 12 }}
            data-testid="cell-diagnostic-tooltip"
            role="tooltip"
          >
            {diagnosticHover.issues.map((issue, index) => (
              <div key={`${issue.ruleId}:${index}`} className="whitespace-nowrap">
                <span
                  className={issue.severity === 'error' ? 'text-destructive' : 'text-amber-600'}
                >
                  {issue.ruleId}
                </span>{' '}
                {issue.message}
              </div>
            ))}
          </div>
        ) : null}
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

/** Small corner triangle for cells with diagnostics. */
function ctxMarker(ctx: CanvasRenderingContext2D, rect: Rectangle, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.width - 9, rect.y + 2);
  ctx.lineTo(rect.x + rect.width - 2, rect.y + 2);
  ctx.lineTo(rect.x + rect.width - 2, rect.y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Rose strikethrough for a row staged for deletion. */
function ctxStrike(ctx: CanvasRenderingContext2D, rect: Rectangle): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.75)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(rect.x + 6, rect.y + rect.height / 2);
  ctx.lineTo(rect.x + rect.width - 6, rect.y + rect.height / 2);
  ctx.stroke();
  ctx.restore();
}

/** Amber underline for a modified cell in a staged draft. */
function ctxUnderline(ctx: CanvasRenderingContext2D, rect: Rectangle): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + 2, rect.y + rect.height - 2);
  ctx.lineTo(rect.x + rect.width - 2, rect.y + rect.height - 2);
  ctx.stroke();
  ctx.restore();
}
