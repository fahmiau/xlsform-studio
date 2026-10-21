import { produce } from 'immer';

import type { ColumnKey, ManagedSheetName, RowId, WorkbookData } from '../model/types';

export interface CellEdit {
  rowId: RowId;
  column: ColumnKey;
  value: string;
}

/**
 * Apply a batch of cell edits in one operation. Unknown rows are ignored (a
 * stale grid row may race a delete); unknown columns are an error because the
 * caller is expected to add the column first.
 */
export function setCells(
  data: WorkbookData,
  sheet: ManagedSheetName,
  edits: readonly CellEdit[],
): WorkbookData {
  const target = data[sheet];
  for (const edit of edits) {
    if (!target.columns.includes(edit.column)) {
      throw new Error(`Column "${edit.column}" does not exist in the ${sheet} sheet.`);
    }
  }

  return produce(data, (draft) => {
    const rows = new Map(draft[sheet].rows.map((row) => [row.id, row]));
    for (const edit of edits) {
      const row = rows.get(edit.rowId);
      if (!row) continue;
      if (edit.value === '') delete row.cells[edit.column];
      else row.cells[edit.column] = edit.value;
    }
  });
}

/** Read one cell, treating absent values as empty strings. */
export function getCell(
  data: WorkbookData,
  sheet: ManagedSheetName,
  rowId: RowId,
  column: ColumnKey,
): string {
  const row = data[sheet].rows.find((candidate) => candidate.id === rowId);
  return row?.cells[column] ?? '';
}
