import { produce } from 'immer';

import type { ColumnKey, ManagedSheetName, WorkbookData } from '../model/types';

/** Add a column at the end (or at `atIndex`) without touching existing cells. */
export function addColumn(
  data: WorkbookData,
  sheet: ManagedSheetName,
  column: ColumnKey,
  atIndex?: number,
): WorkbookData {
  if (data[sheet].columns.includes(column)) return data;
  return produce(data, (draft) => {
    const columns = draft[sheet].columns;
    const index =
      atIndex === undefined ? columns.length : Math.max(0, Math.min(atIndex, columns.length));
    columns.splice(index, 0, column);
  });
}

/** Remove a column and every value stored under it. */
export function removeColumn(
  data: WorkbookData,
  sheet: ManagedSheetName,
  column: ColumnKey,
): WorkbookData {
  if (!data[sheet].columns.includes(column)) return data;
  return produce(data, (draft) => {
    draft[sheet].columns = draft[sheet].columns.filter((candidate) => candidate !== column);
    for (const row of draft[sheet].rows) {
      delete row.cells[column];
    }
  });
}

/**
 * Rename a column header (the model key is the verbatim header, AD-5). Values
 * move with the header so no data is lost; the original header text is removed.
 */
export function renameColumn(
  data: WorkbookData,
  sheet: ManagedSheetName,
  from: ColumnKey,
  to: ColumnKey,
): WorkbookData {
  const trimmed = to.trim();
  if (!trimmed || from === trimmed) return data;
  const target = data[sheet];
  if (!target.columns.includes(from) || target.columns.includes(trimmed)) return data;
  return produce(data, (draft) => {
    draft[sheet].columns = draft[sheet].columns.map((column) =>
      column === from ? trimmed : column,
    );
    for (const row of draft[sheet].rows) {
      if (from in row.cells) {
        row.cells[trimmed] = row.cells[from] ?? '';
        delete row.cells[from];
      }
    }
    if (draft[sheet].headerText && from in draft[sheet].headerText) {
      draft[sheet].headerText[trimmed] = draft[sheet].headerText[from] ?? '';
      delete draft[sheet].headerText[from];
    }
  });
}
