/**
 * Visible-row projection (Task 2.2). Folding lands in Stage 3 (3.7); until then
 * this is the identity mapping, but every grid access goes through it so the
 * folding change is local.
 */
import type { Row, SheetData } from '@/core/model/types';

export interface RowProjection {
  /** Real row index for each visible row. */
  realIndexes: readonly number[];
  /** Visible index for each real row, or -1 when hidden. */
  visibleIndexes: readonly number[];
}

export function identityProjection(sheet: SheetData): RowProjection {
  const count = sheet.rows.length;
  const realIndexes = Array.from({ length: count }, (_, index) => index);
  return { realIndexes, visibleIndexes: realIndexes };
}

export function realRowIndex(projection: RowProjection, visibleRow: number): number {
  return projection.realIndexes[visibleRow] ?? -1;
}

export function visibleRowIndex(projection: RowProjection, realRow: number): number {
  return projection.visibleIndexes[realRow] ?? -1;
}

export function rowAt(
  sheet: SheetData,
  projection: RowProjection,
  visibleRow: number,
): Row | undefined {
  const real = realRowIndex(projection, visibleRow);
  return real < 0 ? undefined : sheet.rows[real];
}

export function realIndexesFor(
  projection: RowProjection,
  visibleRows: readonly number[],
): number[] {
  return visibleRows
    .map((row) => realRowIndex(projection, row))
    .filter((row) => row >= 0)
    .sort((a, b) => a - b);
}
