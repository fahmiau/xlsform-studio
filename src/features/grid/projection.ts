/**
 * Visible-row projection (Tasks 2.2 / 3.7). Fold state lives in `uiStore`
 * (AD-3), so this module only maps visible rows to real sheet rows.
 */
import type { GroupTreeIndex } from '@/core/indexes/groupTree';
import type { Row, RowId, SheetData } from '@/core/model/types';

export interface RowProjection {
  /** Real row index for each visible row. */
  realIndexes: ArrayLike<number>;
  /** Visible index for each real row, or -1 when hidden. */
  visibleIndexes: ArrayLike<number>;
}

export interface ProjectionOptions {
  /** Group tree for the sheet; required for folding. */
  groups?: GroupTreeIndex;
  collapsed?: ReadonlySet<RowId>;
}

export function identityProjection(sheet: SheetData): RowProjection {
  const count = sheet.rows.length;
  const realIndexes = new Int32Array(count);
  for (let index = 0; index < count; index += 1) realIndexes[index] = index;
  return { realIndexes, visibleIndexes: realIndexes };
}

/**
 * Hide rows strictly between a collapsed group's begin and end row. Nested
 * groups need no special handling: a hidden outer range hides them too, and
 * unclosed groups (`endRowIndex = -1`) are never collapsible (XLS-003).
 */
export function buildProjection(sheet: SheetData, options: ProjectionOptions = {}): RowProjection {
  const count = sheet.rows.length;
  const collapsed = options.collapsed;
  if (!options.groups || !collapsed || collapsed.size === 0) return identityProjection(sheet);

  const hidden = new Uint8Array(count);
  for (const group of options.groups.groups) {
    if (group.endRowIndex < 0 || !collapsed.has(group.id)) continue;
    const start = Math.max(0, group.startRowIndex + 1);
    const end = Math.min(count - 1, group.endRowIndex - 1);
    for (let index = start; index <= end; index += 1) hidden[index] = 1;
  }

  const real: number[] = [];
  const visible = new Int32Array(count).fill(-1);
  for (let index = 0; index < count; index += 1) {
    if (hidden[index] === 1) continue;
    visible[index] = real.length;
    real.push(index);
  }
  return { realIndexes: real, visibleIndexes: visible };
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

/** Visible row count, for Glide's `rows` prop. */
export function visibleRowCount(projection: RowProjection): number {
  return projection.realIndexes.length;
}
