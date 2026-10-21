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
