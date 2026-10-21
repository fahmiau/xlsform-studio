/**
 * Shared helpers for the pure row/cell operations (master plan AD-2).
 */

import type { ColumnKey } from '../model/types';

/** Trim empty strings out of a cell record so the model stays sparse. */
export function sparseCells(cells: Record<ColumnKey, string>): Record<ColumnKey, string> {
  const next: Record<ColumnKey, string> = {};
  for (const [key, value] of Object.entries(cells)) {
    if (value !== '') next[key] = value;
  }
  return next;
}
