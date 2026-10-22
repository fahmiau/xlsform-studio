import { produce } from 'immer';

import { newRowId } from '../model/factory';
import type { ManagedSheetName, Row, RowId, WorkbookData } from '../model/types';
import { sparseCells } from './shared';

export type RowInsert = Pick<Row, 'cells'> & Partial<Pick<Row, 'id' | 'meta'>>;

/** Clamp an insertion index into `[0, rowCount]`. */
export function clampIndex(index: number, rowCount: number): number {
  if (!Number.isFinite(index)) return rowCount;
  return Math.max(0, Math.min(Math.trunc(index), rowCount));
}

export function insertRows(
  data: WorkbookData,
  sheet: ManagedSheetName,
  atIndex: number,
  rows: readonly RowInsert[],
): WorkbookData {
  return produce(data, (draft) => {
    const target = draft[sheet];
    const existing = new Set(target.rows.map((row) => row.id));
    const inserted = rows.map((row): Row => {
      const id = row.id && !existing.has(row.id) ? row.id : newRowId();
      existing.add(id);
      const next: Row = { id, cells: sparseCells({ ...row.cells }) };
      if (row.meta) next.meta = { ...row.meta };
      return next;
    });
    const index = clampIndex(atIndex, target.rows.length);
    target.rows.splice(index, 0, ...inserted);
  });
}

export function deleteRows(
  data: WorkbookData,
  sheet: ManagedSheetName,
  rowIds: readonly RowId[],
): WorkbookData {
  const remove = new Set(rowIds);
  return produce(data, (draft) => {
    draft[sheet].rows = draft[sheet].rows.filter((row) => !remove.has(row.id));
  });
}

/** Duplicate each selected row immediately after itself, in document order. */
export function duplicateRows(
  data: WorkbookData,
  sheet: ManagedSheetName,
  rowIds: readonly RowId[],
): WorkbookData {
  const selected = new Set(rowIds);
  return produce(data, (draft) => {
    const next: Row[] = [];
    for (const row of draft[sheet].rows) {
      next.push(row);
      if (!selected.has(row.id)) continue;
      const copy: Row = { id: newRowId(), cells: { ...row.cells } };
      if (row.meta) copy.meta = { ...row.meta };
      next.push(copy);
    }
    draft[sheet].rows = next;
  });
}

/**
 * Move a contiguous block to `toIndex` (an insertion point in the pre-move
 * coordinate space). Dropping inside the block or at either edge is a no-op.
 */
export function moveBlock(
  data: WorkbookData,
  sheet: ManagedSheetName,
  fromStart: number,
  fromEnd: number,
  toIndex: number,
): WorkbookData {
  const rows = data[sheet].rows;
  const start = Math.max(0, Math.min(fromStart, fromEnd));
  const end = Math.min(rows.length - 1, Math.max(fromStart, fromEnd));
  if (start > end || rows.length === 0) return data;
  if (toIndex > start && toIndex <= end + 1) return data;

  const block = rows.slice(start, end + 1);
  const rest = rows.filter((_row, index) => index < start || index > end);
  let insertAt = toIndex;
  if (toIndex > end) insertAt = toIndex - block.length;
  insertAt = Math.max(0, Math.min(insertAt, rest.length));
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  if (next.length === rows.length && next.every((row, index) => row === rows[index])) return data;

  return produce(data, (draft) => {
    draft[sheet].rows = next;
  });
}
