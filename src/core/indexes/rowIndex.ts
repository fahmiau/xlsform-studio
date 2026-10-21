import type { RowId, SheetData } from '../model/types';

/** Row id → position lookup for O(1) jumps. */
export function buildRowIndex(sheet: SheetData): Map<RowId, number> {
  const index = new Map<RowId, number>();
  sheet.rows.forEach((row, position) => index.set(row.id, position));
  return index;
}
