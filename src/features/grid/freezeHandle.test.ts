import { describe, expect, it } from 'vitest';

import {
  columnWidthsFromDisplay,
  computeAddRowBarTop,
  computeFreezeBoundaries,
  frozenEdgeX,
  snapFreezeBoundary,
} from './freezeHandle';

describe('freezeHandle geometry', () => {
  // Gutter 88 + type 130 + name 150 + label 240 + hint 200 + relevant 160.
  const widths = [88, 130, 150, 240, 200, 160];

  it('extracts numeric widths with a 160 px fallback', () => {
    expect(
      columnWidthsFromDisplay([
        { id: '__gutter__', title: '', width: 88 },
        { id: 'type', title: 'type', width: 130 },
        { id: 'grow', title: 'grow', grow: 1 },
      ]),
    ).toEqual([88, 130, 160]);
  });

  it('computes the right edge of the frozen pane', () => {
    expect(frozenEdgeX(widths, 1)).toBe(88);
    expect(frozenEdgeX(widths, 4)).toBe(608);
    expect(frozenEdgeX(widths, 99)).toBe(968);
  });

  it('computes every visible boundary when scrollLeft is 0', () => {
    const boundaries = computeFreezeBoundaries(widths, 4, 0, 1200);
    expect(boundaries).toEqual([
      { dataCount: 0, x: 88 },
      { dataCount: 1, x: 218 },
      { dataCount: 2, x: 368 },
      { dataCount: 3, x: 608 },
      { dataCount: 4, x: 808 },
      { dataCount: 5, x: 968 },
    ]);
  });

  it('skips scrollable boundaries scrolled behind the frozen pane or past viewport', () => {
    // Only gutter frozen (88), scrolled right by 150 px:
    // col 1 right edge = 88 + 130 - 150 = 68 (hidden behind gutter)
    // col 2 right edge = 88 + 280 - 150 = 218 (visible)
    // col 3 right edge = 88 + 520 - 150 = 458 (visible)
    // col 4 right edge = 88 + 720 - 150 = 658 (past 600 viewport)
    const boundaries = computeFreezeBoundaries(widths, 1, 150, 600);
    expect(boundaries).toEqual([
      { dataCount: 0, x: 88 },
      { dataCount: 2, x: 218 },
      { dataCount: 3, x: 458 },
    ]);
  });

  it('snaps to the nearest column boundary', () => {
    const boundaries = computeFreezeBoundaries(widths, 4, 0, 1200);
    expect(snapFreezeBoundary(50, boundaries)).toEqual({ dataCount: 0, x: 88 });
    expect(snapFreezeBoundary(210, boundaries)).toEqual({ dataCount: 1, x: 218 });
    expect(snapFreezeBoundary(350, boundaries)).toEqual({ dataCount: 2, x: 368 });
    expect(snapFreezeBoundary(820, boundaries)).toEqual({ dataCount: 4, x: 808 });
    expect(snapFreezeBoundary(100, [])).toBeUndefined();
  });

  it('computes AddRowBar top offset and hides it outside the visible body', () => {
    // 3 rows at 34 px each: sits at y = 102 inside a 400 px body.
    expect(computeAddRowBarTop(3, 0, 0, 34, 400)).toBe(102);
    // 0 rows: sits directly under the header at y = 0.
    expect(computeAddRowBarTop(0, 0, 0, 34, 400)).toBe(0);
    // Smooth scroll offset ty = -10 shifts it up by 10 px.
    expect(computeAddRowBarTop(10, 5, -10, 34, 400)).toBe(160);
    // Scrolled far above the end: off-screen below bodyHeight.
    expect(computeAddRowBarTop(90, 0, 0, 34, 400)).toBeNull();
    // Zero body height: hidden.
    expect(computeAddRowBarTop(0, 0, 0, 34, 0)).toBeNull();
  });
});
