import { describe, expect, it } from 'vitest';

import { computeRevealScrollTarget } from './revealScroll';

const baseTarget = {
  col: 2,
  row: 30,
  columnWidths: [56, 160, 220, 260, 180],
  frozenCount: 1,
  rowCount: 100,
  rowHeight: 32,
  headerHeight: 34,
};

describe('computeRevealScrollTarget', () => {
  it('returns null when the target cell is already completely inside the viewport', () => {
    const result = computeRevealScrollTarget(
      {
        scrollLeft: 0,
        scrollTop: 25 * 32,
        clientWidth: 900,
        clientHeight: 500,
        scrollWidth: 900,
        scrollHeight: 34 + 100 * 32,
      },
      baseTarget,
    );
    expect(result).toBeNull();
  });

  it('scrolls up and centers the row when scrolled far below the target', () => {
    const result = computeRevealScrollTarget(
      {
        scrollLeft: 0,
        scrollTop: 78 * 32,
        clientWidth: 900,
        clientHeight: 500,
        scrollWidth: 900,
        scrollHeight: 34 + 100 * 32,
      },
      baseTarget,
    );
    expect(result).not.toBeNull();
    expect(result?.top).toBeLessThan(30 * 32);
    expect(result?.top).toBeGreaterThan(20 * 32);
    expect(result?.left).toBe(0);
  });

  it('scrolls down and centers a deep row when scrolled at row 0', () => {
    const result = computeRevealScrollTarget(
      {
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 900,
        clientHeight: 500,
        scrollWidth: 900,
        scrollHeight: 34 + 100 * 32,
      },
      { ...baseTarget, row: 75 },
    );
    expect(result).not.toBeNull();
    expect(result!.top).toBeLessThanOrEqual(75 * 32);
    expect(result!.top + 500 - 34).toBeGreaterThanOrEqual(76 * 32);
  });

  it('scrolls horizontally for offscreen non-frozen columns while leaving frozen columns untouched', () => {
    const wideColumns = [56, 160, 220, 260, 300, 300];
    const scrollRight = computeRevealScrollTarget(
      {
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 500,
        clientHeight: 500,
        scrollWidth: 1296,
        scrollHeight: 34 + 100 * 32,
      },
      { ...baseTarget, row: 1, col: 5, columnWidths: wideColumns },
    );
    expect(scrollRight).not.toBeNull();
    expect(scrollRight!.left).toBeGreaterThan(500);
    expect(scrollRight!.top).toBe(0);

    const frozenCol = computeRevealScrollTarget(
      {
        scrollLeft: 600,
        scrollTop: 0,
        clientWidth: 500,
        clientHeight: 500,
        scrollWidth: 1296,
        scrollHeight: 34 + 100 * 32,
      },
      { ...baseTarget, row: 1, col: 0, columnWidths: wideColumns },
    );
    expect(frozenCol).toBeNull();
  });

  it('scales virtualized scrollHeight for massive sheets', () => {
    const rowCount = 300_000;
    const totalContentHeight = 34 + rowCount * 32;
    const scrollHeight = 5_000_000;
    const clientHeight = 500;
    const result = computeRevealScrollTarget(
      {
        scrollLeft: 0,
        scrollTop: 0,
        clientWidth: 900,
        clientHeight,
        scrollWidth: 900,
        scrollHeight,
      },
      { ...baseTarget, row: 150_000, rowCount },
    );
    expect(result).not.toBeNull();
    const ratio = result!.top / (scrollHeight - clientHeight);
    const virtualRatio = (150_000 * 32) / (totalContentHeight - clientHeight);
    expect(Math.abs(ratio - virtualRatio)).toBeLessThan(0.01);
  });
});
