/**
 * Per-group color rails for the gutter's far-left edge. Pure adapter over the
 * group tree (AD-1); the Glide renderer only consumes the offsets and colors.
 */
import type { GroupTreeIndex } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

export interface GutterRail {
  /** Horizontal offset from the gutter's left edge, in px. */
  offset: number;
  color: string;
}

export interface GroupRailsOptions {
  /** Offset of an outermost group's rail. */
  baseOffset?: number;
  /** Extra offset per nesting level. */
  offsetStep?: number;
  /** Deepest level that still shifts right; deeper groups share this offset. */
  maxDepth?: number;
}

/**
 * One rail stack per real sheet row, in document order per row. Hidden rows
 * keep their rails: the grid indexes this by real row, so folding costs nothing.
 */
export function buildGroupRails(
  sheet: SheetData,
  groups: GroupTreeIndex,
  palette: readonly string[],
  options: GroupRailsOptions = {},
): GutterRail[][] {
  const rowCount = sheet.rows.length;
  const rails: GutterRail[][] = Array.from({ length: rowCount }, () => []);
  if (palette.length === 0) return rails;

  const baseOffset = options.baseOffset ?? 1;
  const offsetStep = options.offsetStep ?? 3;
  const maxDepth = options.maxDepth ?? 3;

  groups.groups.forEach((group, index) => {
    const color = palette[index % palette.length];
    if (color === undefined) return;
    const start = Math.max(0, group.startRowIndex);
    const end = group.endRowIndex < 0 ? rowCount - 1 : Math.min(rowCount - 1, group.endRowIndex);
    if (end < start) return;
    const offset = baseOffset + Math.min(group.depth, maxDepth) * offsetStep;
    for (let row = start; row <= end; row += 1) {
      rails[row]?.push({ offset, color });
    }
  });

  return rails;
}
