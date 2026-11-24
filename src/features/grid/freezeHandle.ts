/** Pure viewport geometry for the draggable freeze bar and the Add-row bar. */
import type { GridColumn } from '@glideapps/glide-data-grid';

export interface FreezeBoundary {
  /** Number of frozen data columns (0 = unfrozen; gutter stays fixed). */
  dataCount: number;
  /** Visible X coordinate inside the grid host in CSS pixels. */
  x: number;
}

const DEFAULT_COLUMN_WIDTH = 160;

export function columnWidthsFromDisplay(columns: readonly GridColumn[]): number[] {
  return columns.map((column) =>
    'width' in column && typeof column.width === 'number' ? column.width : DEFAULT_COLUMN_WIDTH,
  );
}

/** X coordinate of the right edge of the frozen pane (gutter + frozen data columns). */
export function frozenEdgeX(columnWidths: readonly number[], frozenCount: number): number {
  const limit = Math.max(0, Math.min(frozenCount, columnWidths.length));
  let x = 0;
  for (let i = 0; i < limit; i += 1) {
    x += columnWidths[i] ?? 0;
  }
  return x;
}

/**
 * Compute all visible column boundaries the freeze handle can snap to.
 * Boundary `0` sits at the right edge of the fixed row-number gutter.
 */
export function computeFreezeBoundaries(
  columnWidths: readonly number[],
  frozenCount: number,
  scrollLeft: number,
  viewportWidth: number,
): FreezeBoundary[] {
  if (columnWidths.length === 0 || viewportWidth <= 0) return [];
  const safeFrozen = Math.max(1, Math.min(frozenCount, columnWidths.length));
  const boundaries: FreezeBoundary[] = [];

  let x = columnWidths[0] ?? 0;
  if (x <= viewportWidth) {
    boundaries.push({ dataCount: 0, x });
  }

  for (let col = 1; col < safeFrozen; col += 1) {
    x += columnWidths[col] ?? 0;
    if (x <= viewportWidth) {
      boundaries.push({ dataCount: col, x });
    }
  }

  const frozenRight = x;
  let scrollableCumulative = 0;
  for (let col = safeFrozen; col < columnWidths.length; col += 1) {
    scrollableCumulative += columnWidths[col] ?? 0;
    const visibleX = frozenRight + scrollableCumulative - scrollLeft;
    if (visibleX > frozenRight && visibleX <= viewportWidth) {
      boundaries.push({ dataCount: col, x: visibleX });
    }
  }

  return boundaries;
}

/** Pick the boundary nearest to `pointerX`, or `undefined` if none exist. */
export function snapFreezeBoundary(
  pointerX: number,
  boundaries: readonly FreezeBoundary[],
): FreezeBoundary | undefined {
  let best: FreezeBoundary | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const boundary of boundaries) {
    const distance = Math.abs(pointerX - boundary.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = boundary;
    }
  }
  return best;
}

/**
 * Top offset of the trailing Add-row bar inside the grid body (below header),
 * or `null` when the trailing row is scrolled outside the visible viewport.
 */
export function computeAddRowBarTop(
  rowCount: number,
  visibleRowStart: number,
  translateY: number,
  rowHeight: number,
  bodyHeight: number,
): number | null {
  if (bodyHeight <= 0 || rowHeight <= 0) return null;
  const top = (rowCount - visibleRowStart) * rowHeight + translateY;
  if (top <= -rowHeight || top >= bodyHeight) return null;
  return top;
}
