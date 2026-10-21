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
