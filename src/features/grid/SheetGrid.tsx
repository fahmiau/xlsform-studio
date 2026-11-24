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
import { resolveFilterParentList } from '@/core/ops/choices';
import { insertRows } from '@/core/ops/rows';
import { modeFromStyle } from '@/core/slug/slugify';
import { applyCellEdits, type CellEditOutcome } from '@/features/grid/cellEditPipeline';
import { notifyCellEdits } from '@/features/shell/toasts';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { selectReviewPending, useStagingStore } from '@/state/stagingStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore, type ActionMeta } from '@/state/workbookStore';
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
import { computeDiagnosticTooltipLayout } from './diagnosticTooltip';
import { isCellEditable, structuralRowKind, type StructuralRowKind } from './editability';
import { createDirectTypeController, DirectTypeProvider } from './editors/directTypeBuffer';
import { useEditorRouting } from './editors/useEditorRouting';
import { tileFill } from './fill';
import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from './geometry';
import { buildGroupRails } from './groupRails';
import { HeaderMenu, type HeaderMenuState } from './HeaderMenu';
import { AddColumnDialog } from './AddColumnDialog';
import { AddRowBar } from './AddRowBar';
import { FreezeColumnHandle } from './FreezeColumnHandle';
import { columnWidthsFromDisplay, computeAddRowBarTop } from './freezeHandle';
import { computeRevealScrollTarget } from './revealScroll';
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

const scrollMemory = new Map<string, { col: number; row: number }>();

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
  const customFrozenColumns = useUiStore((state) => state.frozenColumns[sheetName]);
  const hidden = useUiStore((state) => state.hiddenColumns[sheetName]);
  const collapsedGroupIds = useUiStore((state) => state.collapsedGroupIds);
  const flashRowId = useUiStore((state) => state.flashRowId);
  const reveal = useUiStore((state) => state.reveal);
  const themeMode = usePrefsStore((state) => state.theme);
  const dark = useIsDark(themeMode);
  const gridTheme = useMemo(() => buildGridTheme(dark), [dark]);
  const provideEditor = useEditorRouting();
  const [directType] = useState(() => createDirectTypeController());

  useEffect(() => () => directType.clear(), [directType]);

  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollRegion, setScrollRegion] = useState({
    y: 0,
    ty: 0,
    clientWidth: 0,
    clientHeight: 0,
  });
  const uiGridSelection = useUiStore((state) => state.gridSelections[sheetName]);
  const [drawerGridSelection, setDrawerGridSelection] = useState<GridSelection | undefined>(
    undefined,
  );
  const storedGridSelection = compact ? drawerGridSelection : uiGridSelection;
  const fallbackGridSelection = useMemo(() => gridSelectionForCell(1, 0), []);
  const [rowMenu, setRowMenu] = useState<RowContextMenuState | null>(null);
  const [headerMenu, setHeaderMenu] = useState<HeaderMenuState | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [diagnosticHover, setDiagnosticHover] = useState<{
    style: {
      maxWidth: number;
      left?: number;
      right?: number;
      top?: number;
      bottom?: number;
    };
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
  const allowCustomFreeze = !compact && languageView.mode !== 'split';
  const display = useMemo(
    () =>
      buildDisplayColumns(viewSheet, config, {
        widths,
        hidden,
        // The drawer's explicit columnKeys are ordered by the caller.
        order: columnKeys ? undefined : storedOrder,
        ...(view ? { keys: view.columns, frozen: view.frozen } : {}),
        ...(allowCustomFreeze && customFrozenColumns !== undefined
          ? { frozenDataCount: customFrozenColumns }
          : {}),
        ...(compact ? { gutterWidth: 48 } : {}),
      }),
    [
      allowCustomFreeze,
      columnKeys,
      compact,
      config,
      customFrozenColumns,
      hidden,
      storedOrder,
      view,
      viewSheet,
      widths,
    ],
  );
  const displayColumnWidths = useMemo(
    () => columnWidthsFromDisplay(display.columns),
    [display.columns],
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
    if (!storedGridSelection || rowCount === 0 || display.columns.length <= 1) {
      return fallbackGridSelection;
    }
    const range = storedGridSelection.current?.range;
    const cell = storedGridSelection.current?.cell;
    if (
      range &&
      cell &&
      (range.y >= rowCount ||
        range.x >= display.columns.length ||
        cell[1] >= rowCount ||
        cell[0] >= display.columns.length)
    ) {
      const clampedCol = Math.min(Math.max(1, cell[0]), display.columns.length - 1);
      const clampedRow = Math.min(Math.max(0, cell[1]), rowCount - 1);
      return gridSelectionForCell(clampedCol, clampedRow);
    }
    return storedGridSelection;
  }, [display.columns.length, fallbackGridSelection, rowCount, storedGridSelection]);

  const setGridSelection = useCallback(
    (selection: GridSelection) => {
      if (compact) setDrawerGridSelection(selection);
      else useUiStore.getState().setGridSelection(sheetName, selection);
    },
    [compact, sheetName],
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
  const visibleRegionObjRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const restoreRegionRef = useRef<(() => void) | null>(null);
  const editingCellRef = useRef<Item | null>(null);
  const pendingScrollRef = useRef<{
    nonce: number;
    rowId: RowId;
    col: number;
    row: number;
  } | null>(null);
  const restoredScrollRef = useRef(false);

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

  // Restore the per-sheet scroll position once on mount after the canvas has a size.
  useEffect(() => {
    if (size.width === 0 || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    if (pendingScrollRef.current || (reveal && reveal.sheet === sheetName)) return;
    const memory = scrollMemory.get(compact ? `${sheetName}:drawer` : sheetName);
    if (!memory) return;
    const targetCol = Math.min(memory.col, Math.max(0, display.columns.length - 1));
    const targetRow = Math.min(memory.row, Math.max(0, rowCount - 1));
    if (targetCol <= display.frozenCount && targetRow === 0) return;
    gridRef.current?.scrollTo(targetCol, targetRow, 'both', 0, 0, {
      hAlign: 'start',
      vAlign: 'start',
    });
  }, [
    compact,
    display.columns.length,
    display.frozenCount,
    reveal,
    rowCount,
    sheetName,
    size.width,
  ]);

  // Restore the active cell when the columns change or the sheet mounts.
  const keySignature = display.keys.join('\u0000');
  useEffect(() => {
    const pendingReveal = useUiStore.getState().reveal;
    if (pendingReveal && pendingReveal.sheet === sheetName) return;
    if (compact) return;
    const cell = useUiStore.getState().activeCells[sheetName];
    const rowIndex = cell ? visibleRowIndex(projection, findRowIndex(sheet, cell.rowId)) : -1;
    const columnIndex = cell ? display.keys.indexOf(cell.column) + 1 : -1;
    if (rowIndex >= 0 && columnIndex > 0) {
      useUiStore
        .getState()
        .setGridSelection(sheetName, gridSelectionForCell(columnIndex, rowIndex));
    } else if (rowCount > 0) {
      useUiStore
        .getState()
        .setGridSelection(sheetName, gridSelectionForCell(Math.min(1, display.keys.length), 0));
    }
    // Only react to a changed column signature; edits must not reset selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, keySignature, sheetName]);

  // Reveal expands collapsed ancestors before selecting and scrolling to the cell (Task 3.7).
  useEffect(() => {
    if (!reveal || reveal.sheet !== sheetName || reveal.nonce === handledReveal.current) return;
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
    handledReveal.current = reveal.nonce;
    if (ancestors.some((id) => collapsedGroupIds.has(id))) {
      useUiStore.getState().expandGroups(ancestors);
    }

    const active = useUiStore.getState().activeCell;
    const fallbackColumn = active?.sheet === sheetName ? active.column : '';
    const requestedIdx = reveal.column ? display.keys.indexOf(reveal.column) : -1;
    const fallbackIdx = fallbackColumn ? display.keys.indexOf(fallbackColumn) : -1;
    const columnIndex =
      requestedIdx >= 0
        ? requestedIdx + 1
        : fallbackIdx >= 0
          ? fallbackIdx + 1
          : Math.min(1, display.keys.length);
    const resolvedColumn = display.keys[columnIndex - 1] ?? '';

    const nextGridSelection = gridSelectionForCell(columnIndex, visibleIndex);
    if (compact) {
      queueMicrotask(() => setDrawerGridSelection(nextGridSelection));
    } else {
      useUiStore.getState().setGridSelection(sheetName, nextGridSelection);
    }
    useUiStore.getState().setSelectedRowIds([reveal.rowId]);
    if (resolvedColumn) {
      const nextRef = { sheet: sheetName, rowId: reveal.rowId, column: resolvedColumn };
      useUiStore.getState().setActiveCell(nextRef);
      useUiStore.getState().setSelection({ sheet: sheetName, anchor: nextRef, focus: nextRef });
    }
    pendingScrollRef.current = {
      nonce: reveal.nonce,
      rowId: reveal.rowId,
      col: columnIndex,
      row: visibleIndex,
    };
    if (reveal.focus !== false) gridRef.current?.focus();
  }, [
    compact,
    reveal,
    sheetName,
    sheet,
    display.keys,
    collapsedGroupIds,
    groupsForDepth,
    projection,
  ]);

  // Execute the reveal scroll after selection updates and Glide's scroller has settled.
  // Calling `gridRef.current?.scrollTo` before `setGridSelection` commits triggers
  // Glide's internal `useLayoutEffect` scrollTo on stale `cellYOffset`, doubling
  // the scroll delta and overshooting when scrolled far away.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || size.width === 0 || size.height === 0) return;
    if (pending.row >= rowCount || pending.col >= display.columns.length) return;
    const real = realRowIndex(projection, pending.row);
    if (real < 0 || sheet.rows[real]?.id !== pending.rowId) return;
    const currentCell = gridSelection.current?.cell;
    if (!currentCell || currentCell[0] !== pending.col || currentCell[1] !== pending.row) return;

    let frameId = 0;
    let attempts = 0;
    const columnWidths = display.columns.map((column) =>
      'width' in column && typeof column.width === 'number' ? column.width : 160,
    );
    const flush = () => {
      if (pendingScrollRef.current?.nonce !== pending.nonce) return;
      const scroller = hostRef.current?.querySelector('.dvn-scroller');
      if (!(scroller instanceof HTMLElement) || scroller.clientHeight === 0) {
        if (attempts < 10) {
          attempts += 1;
          frameId = requestAnimationFrame(flush);
        } else {
          pendingScrollRef.current = null;
        }
        return;
      }
      pendingScrollRef.current = null;
      const target = computeRevealScrollTarget(
        {
          scrollLeft: scroller.scrollLeft,
          scrollTop: scroller.scrollTop,
          clientWidth: scroller.clientWidth,
          clientHeight: scroller.clientHeight,
          scrollWidth: scroller.scrollWidth,
          scrollHeight: scroller.scrollHeight,
        },
        {
          col: pending.col,
          row: pending.row,
          columnWidths,
          frozenCount: display.frozenCount,
          rowCount,
          rowHeight: GRID_ROW_HEIGHT,
          headerHeight: GRID_HEADER_HEIGHT,
        },
      );
      if (target) {
        scroller.scrollTo(target.left, target.top);
      }
    };

    frameId = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(frameId);
  }, [
    display.columns,
    display.frozenCount,
    gridSelection,
    projection,
    reveal,
    rowCount,
    sheet.rows,
    size.height,
    size.width,
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

      if (sheetName === 'choices' && columnBase === 'custom' && !locked) {
        const rowListName = (row.cells[listNameKey ?? 'list_name'] ?? '').trim();
        const parentListName = rowListName ? resolveFilterParentList(data, rowListName, key) : null;
        if (parentListName) {
          return makeEnumCell({
            column: 'filter',
            value: row.cells[key] ?? '',
            rowId: row.id,
            parentListName,
          });
        }
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
      data,
      diagnosticIndex,
      display.keys,
      groupByRowId,
      indexes.choices.byList,
      listNameKey,
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
      restoreRegionRef.current?.();
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
      const columns = new Set<ColumnKey>();
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
        columns.add(key);
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
        { sheet: sheetName, rowIds: [...rowIds], columns: [...columns] },
      );
      if (outcome) notifyCellEdits(outcome);
    },
    [display, locked, onCommitEdits, projection, sheet, sheetName, typeKey],
  );

  const onCellsEdited = useCallback<NonNullable<DataEditorProps['onCellsEdited']>>(
    (items) => {
      if (items[0]) editingCellRef.current = items[0].location;
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
      const colStart = Math.max(0, target[0] - 1);
      const colCount = matrix[0]?.length ?? 0;
      const pasteColumns = display.keys.slice(colStart, colStart + colCount);
      const meta: Omit<ActionMeta, 'label'> = {
        sheet: sheetName,
        ...(pasteColumns.length > 0 ? { columns: pasteColumns } : {}),
      };
      let result: ReturnType<typeof pasteMatrix> | undefined;
      const cellCount = matrix.reduce((total, row) => total + row.length, 0);
      useWorkbookStore.getState().apply(
        `Paste ${cellCount} cell${cellCount === 1 ? '' : 's'}`,
        (current) => {
          result = pasteMatrix(
            current,
            sheetName,
            { rowIndex: target[1], columnIndex: colStart },
            matrix,
            display.keys,
            { rowIndexes: projection.realIndexes },
          );
          if (result.rowIds.length > 0) meta.rowIds = result.rowIds;
          return result.data;
        },
        meta,
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
      const fillColumns = selectionColumnKeysForRange(display.keys, destination);
      const rowIndexes = Array.from({ length: source.height }, (_, offset) =>
        realRowIndex(projection, source.y + offset),
      );
      const sourceMatrix = rowIndexes.map((real) =>
        sourceKeys.map((key) => (real >= 0 ? (sheet.rows[real]?.cells[key] ?? '') : '')),
      );
      const matrix = tileFill(sourceMatrix, destination.height, destination.width);
      const meta: Omit<ActionMeta, 'label'> = {
        sheet: sheetName,
        ...(fillColumns.length > 0 ? { columns: fillColumns } : {}),
        ...(compact ? { inDrawer: true } : {}),
      };
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
          if (result.rowIds.length > 0) meta.rowIds = result.rowIds;
          return result.data;
        },
        meta,
      );
      if (result?.skippedReadOnly) {
        toast.warning(`Skipped ${result.skippedReadOnly} read-only cell(s).`);
      }
    },
    [compact, display.keys, locked, projection, sheet.rows, sheetName],
  );

  const onRowAppended = useCallback<NonNullable<DataEditorProps['onRowAppended']>>(async () => {
    if (locked) return 'bottom' as const;
    if (onAppendRow) {
      const rowId = onAppendRow();
      if (rowId) useUiStore.getState().setSelectedRowIds([rowId]);
      return 'bottom' as const;
    }
    const meta: Omit<ActionMeta, 'label'> = { sheet: sheetName };
    let rowId: string | undefined;
    useWorkbookStore.getState().apply(
      'Add row',
      (current) => {
        const next = insertRows(current, sheetName, current[sheetName].rows.length, [
          { cells: {} },
        ]);
        rowId = next[sheetName].rows.at(-1)?.id;
        if (rowId) meta.rowIds = [rowId];
        return next;
      },
      meta,
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

  const commitFreezeColumns = useCallback(
    (nextDataCount: number) => {
      const ui = useUiStore.getState();
      // Preserve current visual order when customizing freeze on files whose
      // headers were not originally in frozen-first order.
      if (!ui.columnOrder[sheetName] && !columnKeys) {
        const sameOrder =
          display.keys.length === viewSheet.columns.length &&
          display.keys.every((key, index) => key === viewSheet.columns[index]);
        if (!sameOrder) ui.setColumnOrder(sheetName, display.keys);
      }
      ui.setFrozenColumns(sheetName, nextDataCount);
    },
    [columnKeys, display.keys, sheetName, viewSheet.columns],
  );

  const handleAddRowClick = useCallback(() => {
    if (locked) return;
    const targetCol = Math.min(1, display.keys.length);
    if (gridRef.current) {
      void gridRef.current.appendRow(targetCol, true);
    } else {
      void onRowAppended();
    }
  }, [display.keys.length, locked, onRowAppended]);

  const handleAddRowWheel = useCallback((event: React.WheelEvent<HTMLButtonElement>) => {
    const scroller = hostRef.current?.querySelector('.dvn-scroller');
    if (!(scroller instanceof HTMLElement)) return;
    scroller.scrollTop += event.deltaY;
    scroller.scrollLeft += event.deltaX;
  }, []);

  const getHostRect = useCallback(() => hostRef.current?.getBoundingClientRect() ?? null, []);
  const getScrollLeft = useCallback(() => {
    const scroller = hostRef.current?.querySelector('.dvn-scroller');
    return scroller instanceof HTMLElement ? scroller.scrollLeft : 0;
  }, []);

  const handleSelectionChange = useCallback(
    (selection: GridSelection) => {
      directType.clear();
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
    [directType, display.keys, onActiveRowChange, projection, setGridSelection, sheet, sheetName],
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
      if (!issues || issues.length === 0) {
        setDiagnosticHover(null);
        return;
      }
      const hostRect = hostRef.current?.getBoundingClientRect();
      if (!hostRect || hostRect.width === 0 || hostRect.height === 0) {
        setDiagnosticHover(null);
        return;
      }
      const layout = computeDiagnosticTooltipLayout(args.bounds, hostRect, GRID_HEADER_HEIGHT);
      setDiagnosticHover({ style: layout.style, issues });
    },
    [diagnosticIndex.byCell, display.keys, projection, sheet.rows],
  );

  const effectiveViewportWidth =
    scrollRegion.clientWidth > 0 &&
    scrollRegion.clientWidth <= size.width &&
    size.width - scrollRegion.clientWidth <= 24
      ? scrollRegion.clientWidth
      : size.width;
  const effectiveViewportHeight =
    scrollRegion.clientHeight > 0 &&
    scrollRegion.clientHeight <= size.height &&
    size.height - scrollRegion.clientHeight <= 24
      ? scrollRegion.clientHeight
      : size.height;
  const bodyHeight = Math.max(0, effectiveViewportHeight - GRID_HEADER_HEIGHT);
  const addRowTop = locked
    ? null
    : computeAddRowBarTop(rowCount, scrollRegion.y, scrollRegion.ty, GRID_ROW_HEIGHT, bodyHeight);
  const dataBottomInBody = Math.max(
    0,
    (rowCount - scrollRegion.y) * GRID_ROW_HEIGHT + scrollRegion.ty,
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

      <div
        ref={hostRef}
        className="relative isolate min-h-0 flex-1"
        onMouseDown={() => directType.clear()}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!next || !(next instanceof Element && next.closest('#portal') !== null)) {
            directType.clear();
          }
        }}
        onMouseLeave={() => {
          hoverKey.current = null;
          setDiagnosticHover((current) => (current ? null : current));
        }}
      >
        <DirectTypeProvider controller={directType}>
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
            onRowAppended={locked ? undefined : onRowAppended}
            onRowMoved={compact ? onMoveRow : undefined}
            onGridSelectionChange={handleSelectionChange}
            gridSelection={gridSelection}
            provideEditor={provideEditor}
            onCellActivated={(cell) => {
              directType.clear();
              editingCellRef.current = cell;
            }}
            onKeyDown={(event) => {
              const activeCell = gridSelection.current?.cell;
              editingCellRef.current = activeCell ?? null;

              if (directType.isActive()) {
                if (activeCell && directType.isActiveFor(activeCell) && directType.pushKey(event)) {
                  event.cancel();
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                directType.clear();
              }

              if (
                event.key.length === 1 &&
                event.key !== ' ' &&
                /[!-~]/.test(event.key) &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                const activeCol = activeCell?.[0] ?? 0;
                const activeRow = activeCell?.[1] ?? -1;
                const region = visibleRegionObjRef.current;
                if (region && region.x > 0 && activeCol > 0 && activeCol < display.frozenCount) {
                  const origX = region.x;
                  const origWidth = region.width;
                  region.x = 0;
                  region.width = origX + origWidth;
                  const restore = () => {
                    if (restoreRegionRef.current !== restore) return;
                    restoreRegionRef.current = null;
                    region.x = origX;
                    region.width = origWidth;
                  };
                  restoreRegionRef.current = restore;
                  queueMicrotask(restore);
                }
                if (
                  !locked &&
                  event.bounds !== undefined &&
                  activeCell &&
                  activeCol > 0 &&
                  activeRow >= 0 &&
                  activeRow < rowCount
                ) {
                  const mangledCol = activeCol + (compact ? 1 : 0);
                  const vr = visibleRegionObjRef.current;
                  const inVisibleRegion = vr
                    ? activeRow >= vr.y &&
                      activeRow <= vr.y + vr.height &&
                      mangledCol >= vr.x &&
                      mangledCol <= vr.x + vr.width
                    : activeRow <= 1 && mangledCol <= 1;
                  if (inVisibleRegion) {
                    const cell = getCellContent(activeCell);
                    const readonly = 'readonly' in cell && cell.readonly === true;
                    if (cell.allowOverlay === true && !readonly) {
                      directType.start(activeCell, event.key);
                    }
                  }
                }
              }
            }}
            onFinishedEditing={(_newValue, movement) => {
              directType.clear();
              const baseCell = editingCellRef.current ?? gridSelection.current?.cell;
              editingCellRef.current = null;
              if (!baseCell || rowCount === 0 || display.columns.length <= 1) return;
              const maxCol = display.columns.length - 1;
              const maxRow = rowCount - 1;
              const targetCol = Math.min(maxCol, Math.max(1, baseCell[0] + movement[0]));
              const targetRow = Math.min(maxRow, Math.max(0, baseCell[1] + movement[1]));
              handleSelectionChange(gridSelectionForCell(targetCol, targetRow));
            }}
            // The completion tooltip is mounted in `document.body`, outside this
            // overlay; without the veto Glide would treat a click on a completion
            // item as an outside click and close the in-cell editor first.
            isOutsideClick={(event) => {
              const target = event.target;
              return !(target instanceof Element && target.closest('.cm-tooltip') !== null);
            }}
            onVisibleRegionChanged={(region, _tx, ty) => {
              visibleRegionObjRef.current = region;
              hoverKey.current = null;
              setDiagnosticHover((current) => (current ? null : current));
              const scroller = hostRef.current?.querySelector('.dvn-scroller');
              const nextClientWidth =
                scroller instanceof HTMLElement && scroller.clientWidth > 0
                  ? scroller.clientWidth
                  : 0;
              const nextClientHeight =
                scroller instanceof HTMLElement && scroller.clientHeight > 0
                  ? scroller.clientHeight
                  : 0;
              const nextY = region.y;
              const nextTy = ty ?? 0;
              setScrollRegion((prev) =>
                prev.y === nextY &&
                prev.ty === nextTy &&
                prev.clientWidth === nextClientWidth &&
                prev.clientHeight === nextClientHeight
                  ? prev
                  : {
                      y: nextY,
                      ty: nextTy,
                      clientWidth: nextClientWidth,
                      clientHeight: nextClientHeight,
                    },
              );
              if (!restoredScrollRef.current) return;
              scrollMemory.set(compact ? `${sheetName}:drawer` : sheetName, {
                col: region.x,
                row: region.y,
              });
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
                    tint: false,
                    hint: '',
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
            keybindings={{ search: false, delete: 'Backspace|Delete' }}
            smoothScrollX={true}
            smoothScrollY={true}
          />
        </DirectTypeProvider>
        <AddRowBar
          topInBody={addRowTop}
          viewportWidth={effectiveViewportWidth}
          bodyHeight={bodyHeight}
          label={compact ? 'Add choice' : 'Add row'}
          onAddRow={handleAddRowClick}
          onWheel={handleAddRowWheel}
        />
        {allowCustomFreeze && effectiveViewportWidth > 0 && display.keys.length > 0 ? (
          <FreezeColumnHandle
            columnWidths={displayColumnWidths}
            frozenCount={display.frozenCount}
            maxDataColumns={display.keys.length}
            viewportWidth={effectiveViewportWidth}
            bodyHeight={bodyHeight}
            dataBottomInBody={dataBottomInBody}
            getHostRect={getHostRect}
            getScrollLeft={getScrollLeft}
            onCommit={commitFreezeColumns}
          />
        ) : null}
        {diagnosticHover ? (
          <div
            className="bg-popover text-popover-foreground border-border pointer-events-none absolute z-50 w-max rounded border px-2.5 py-1.5 text-[11px] leading-snug whitespace-normal break-words shadow-lg"
            style={diagnosticHover.style}
            data-testid="cell-diagnostic-tooltip"
            role="tooltip"
          >
            {diagnosticHover.issues.map((issue, index) => (
              <div key={`${issue.ruleId}:${index}`}>
                <span
                  className={
                    issue.severity === 'error'
                      ? 'text-destructive font-medium'
                      : 'font-medium text-amber-600'
                  }
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
