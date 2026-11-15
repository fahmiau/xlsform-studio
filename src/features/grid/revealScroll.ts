/** Pure viewport math for ensuring a revealed cell is visible inside Glide's scroller. */
export interface ScrollerViewport {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface RevealScrollTarget {
  col: number;
  row: number;
  columnWidths: readonly number[];
  frozenCount: number;
  rowCount: number;
  rowHeight: number;
  headerHeight: number;
}

export interface ScrollAdjustment {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute absolute scroll offsets that guarantee `(col, row)` is completely
 * inside the visible grid viewport, or `null` when it is already visible.
 */
export function computeRevealScrollTarget(
  viewport: ScrollerViewport,
  target: RevealScrollTarget,
): ScrollAdjustment | null {
  if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return null;
  if (target.row < 0 || target.row >= target.rowCount) return null;
  if (target.col < 0 || target.col >= target.columnWidths.length) return null;

  const dataHeight = Math.max(target.rowHeight, viewport.clientHeight - target.headerHeight);
  const totalContentHeight = target.headerHeight + target.rowCount * target.rowHeight;
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  // Glide virtualizes scrollHeight past 5M px; normal sheets map 1:1.
  const virtualized =
    maxScrollTop > 0 && totalContentHeight > viewport.scrollHeight + target.rowHeight * 2;
  const maxVirtualTop = virtualized
    ? Math.max(0, totalContentHeight - viewport.clientHeight)
    : maxScrollTop;
  const currentVirtualTop =
    virtualized && maxScrollTop > 0
      ? (viewport.scrollTop / maxScrollTop) * maxVirtualTop
      : viewport.scrollTop;

  const rowTop = target.row * target.rowHeight;
  const rowBottom = rowTop + target.rowHeight;
  const rowVisible = rowTop >= currentVirtualTop && rowBottom <= currentVirtualTop + dataHeight;

  let nextTop = viewport.scrollTop;
  if (!rowVisible) {
    const centeredVirtualTop = clamp(
      rowTop - Math.floor((dataHeight - target.rowHeight) / 2),
      0,
      maxVirtualTop,
    );
    nextTop =
      virtualized && maxVirtualTop > 0
        ? Math.round((centeredVirtualTop / maxVirtualTop) * maxScrollTop)
        : centeredVirtualTop;
  }

  let nextLeft = viewport.scrollLeft;
  if (target.col >= target.frozenCount) {
    let frozenWidth = 0;
    for (let i = 0; i < target.frozenCount; i += 1) {
      frozenWidth += target.columnWidths[i] ?? 0;
    }
    let colStart = 0;
    for (let i = target.frozenCount; i < target.col; i += 1) {
      colStart += target.columnWidths[i] ?? 0;
    }
    const colWidth = target.columnWidths[target.col] ?? 0;
    const colEnd = colStart + colWidth;
    const scrollableWidth = Math.max(colWidth, viewport.clientWidth - frozenWidth);
    const colVisible =
      colStart >= viewport.scrollLeft && colEnd <= viewport.scrollLeft + scrollableWidth;

    if (!colVisible) {
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const centeredLeft =
        colWidth >= scrollableWidth
          ? colStart
          : colStart - Math.floor((scrollableWidth - colWidth) / 2);
      nextLeft = clamp(centeredLeft, 0, maxScrollLeft);
    }
  }

  if (nextLeft === viewport.scrollLeft && nextTop === viewport.scrollTop) {
    return null;
  }
  return { left: nextLeft, top: nextTop };
}
