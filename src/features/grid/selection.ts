/** Pure selection helpers shared by the grid, clipboard, and row commands. */
import {
  CompactSelection,
  type GridSelection,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';

import type { ColumnKey, Row, RowId, SheetData } from '@/core/model/types';

import type { CellRef, Selection, SheetTab } from '@/state/uiStore';

import { realRowIndex, type RowProjection } from './projection';

export function gridSelectionForCell(
  columnIndex: number,
  rowIndex: number,
  range: Rectangle = { x: columnIndex, y: rowIndex, width: 1, height: 1 },
): GridSelection {
  return {
    current: { cell: [columnIndex, rowIndex], range, rangeStack: [] },
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  };
}

/** Bounds of the current rectangular selection, if any. */
export function selectionBounds(selection: GridSelection): Rectangle | undefined {
  return selection.current?.range;
}

/** Visible row indexes covered by the selection (contiguous or row markers). */
export function selectionRowIndexes(selection: GridSelection): number[] {
  if (selection.rows.length > 0) return selection.rows.toArray().sort((a, b) => a - b);
  const range = selection.current?.range;
  if (!range) return [];
  return Array.from({ length: range.height }, (_, offset) => range.y + offset);
}

export function selectionToRowIds(
  sheet: SheetData,
  selection: GridSelection,
  projection?: RowProjection,
): RowId[] {
  return selectionRowIndexes(selection)
    .map((row) => {
      const real = projection ? realRowIndex(projection, row) : row;
      return real < 0 ? undefined : sheet.rows[real]?.id;
    })
    .filter((id): id is RowId => id !== undefined);
}

/** Rows selected in the UI store, falling back to the active cell. */
export function refFromItem(
  sheet: SheetData,
  keys: ColumnKey[],
  item: Item,
  tab: SheetTab,
  projection?: RowProjection,
): CellRef | null {
  const [columnIndex, visibleRow] = item;
  const rowIndex = projection ? realRowIndex(projection, visibleRow) : visibleRow;
  const row = rowIndex >= 0 ? sheet.rows[rowIndex] : undefined;
  const column = keys[columnIndex - 1];
  if (!row || !column) return null;
  return { sheet: tab, rowId: row.id, column };
}

export function selectionFromRange(
  sheet: SheetData,
  keys: ColumnKey[],
  range: Rectangle,
  tab: SheetTab,
  projection?: RowProjection,
): Selection | null {
  const anchor = refFromItem(sheet, keys, [range.x, range.y], tab, projection);
  const focus = refFromItem(
    sheet,
    keys,
    [range.x + range.width - 1, range.y + range.height - 1],
    tab,
    projection,
  );
  if (!anchor || !focus) return null;
  return { sheet: tab, anchor, focus };
}

/** Data columns touched by a selection; the gutter is excluded. */
export function selectionColumnKeys(
  keys: ColumnKey[],
  range: Rectangle,
): { keys: ColumnKey[]; skippedGutter: boolean } {
  const skippedGutter = range.x <= 0;
  const start = skippedGutter ? 0 : range.x - 1;
  const count = Math.max(0, range.width - (skippedGutter ? 1 : 0));
  return { keys: keys.slice(start, start + count), skippedGutter };
}

export function findRowIndex(sheet: SheetData, rowId: RowId): number {
  return sheet.rows.findIndex((row) => row.id === rowId);
}

export function rowById(sheet: SheetData, rowId: RowId | undefined): Row | undefined {
  if (!rowId) return undefined;
  return sheet.rows.find((row) => row.id === rowId);
}
