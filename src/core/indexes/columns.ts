/**
 * Resolve the worksheet column that holds a canonical base (Task 1.7 review
 * M2). Headers stay verbatim (AD-5), so indexes must not hard-key `row.cells`
 * with canonical names: alias and mixed-case files would produce empty indexes.
 */
import { resolveColumn } from '../model/columns';
import type { ColumnBase } from '../model/columns';
import type { ColumnKey, SheetData } from '../model/types';

export function findColumnKey(sheet: SheetData, base: ColumnBase): ColumnKey | undefined {
  return sheet.columns.find((column) => resolveColumn(column).base === base);
}

/** Like `findColumnKey`, but falls back to the canonical key for default sheets. */
export function columnKey(sheet: SheetData, base: ColumnBase, fallback = base): ColumnKey {
  return findColumnKey(sheet, base) ?? fallback;
}
