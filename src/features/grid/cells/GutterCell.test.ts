import { describe, expect, it } from 'vitest';

import { drawGutter, makeGutterCell, structuralToGutterKind, type GutterCell } from './GutterCell';

interface TextCall {
  text: string;
  x: number;
  y: number;
}

interface RectCall {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface DrawResult {
  texts: TextCall[];
  rects: RectCall[];
}

/** Dependency-free canvas double: records `fillText`/`fillRect`, accepts every draw verb. */
function fakeContext(): { ctx: CanvasRenderingContext2D; result: DrawResult } {
  const result: DrawResult = { texts: [], rects: [] };
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    arc: () => undefined,
    fillText: (text: string, x: number, y: number) => result.texts.push({ text, x, y }),
    fillRect: (x: number, y: number, width: number, height: number) =>
      result.rects.push({ x, y, width, height, color: String(ctx.fillStyle) }),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, result };
}

function draw(
  cell: GutterCell,
  rect: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 88,
    height: 34,
  },
): DrawResult {
  const { ctx, result } = fakeContext();
  const args = {
    ctx,
    rect,
    theme: {
      fontFamily: 'Inter, sans-serif',
      textLight: '#64748b',
      textMedium: '#334155',
      borderColor: '#cbd5e1',
    },
    cell,
  } as unknown as Parameters<typeof drawGutter>[0];
  drawGutter(args);
  return result;
}

describe('gutter row number (Category C5)', () => {
  it('draws a plain row real number even with no group decoration', () => {
    const cell = makeGutterCell({
      depth: 0,
      rowKind: null,
      orphan: false,
      collapsed: false,
      canCollapse: false,
      rowNumber: 3,
    });

    expect(draw(cell).texts.map((call) => call.text)).toContain('3');
  });

  it('draws the real row number 20 for an end_group row', () => {
    const cell = makeGutterCell({
      depth: 1,
      rowKind: 'end_group',
      orphan: false,
      collapsed: false,
      canCollapse: false,
      rowNumber: 20,
    });

    const texts = draw(cell).texts.map((call) => call.text);
    expect(texts).toContain('20');
    expect(texts).toContain('[G]');
  });

  it('omits the number slot when the drawer gutter has no rowNumber', () => {
    const cell = makeGutterCell({
      depth: 0,
      rowKind: null,
      orphan: false,
      collapsed: false,
      canCollapse: false,
    });

    expect(draw(cell).texts.map((call) => call.text)).toEqual([]);
  });

  it('draws the number to the left of the group badge', () => {
    const cell = makeGutterCell({
      depth: 2,
      rowKind: 'group',
      orphan: false,
      collapsed: false,
      canCollapse: true,
      rowNumber: 10,
    });

    const calls = draw(cell).texts;
    const number = calls.find((call) => call.text === '10');
    const badge = calls.find((call) => call.text === '[G]');
    expect(number).toBeDefined();
    expect(badge).toBeDefined();
    expect(number?.x).toBeLessThan(badge?.x ?? 0);
  });
});

describe('group rails', () => {
  it('fills each rail at its gutter offset for the full cell height', () => {
    const cell = makeGutterCell({
      depth: 1,
      rowKind: null,
      orphan: false,
      collapsed: false,
      canCollapse: false,
      rowNumber: 7,
      rails: [
        { offset: 1, color: '#dc2626' },
        { offset: 4, color: '#16a34a' },
      ],
    });

    expect(draw(cell).rects).toEqual([
      { x: 1, y: 0, width: 2, height: 34, color: '#dc2626' },
      { x: 4, y: 0, width: 2, height: 34, color: '#16a34a' },
    ]);
  });

  it('anchors rails to the cell rect, not the canvas origin', () => {
    const cell = makeGutterCell({
      depth: 0,
      rowKind: null,
      orphan: false,
      collapsed: false,
      canCollapse: false,
      rails: [{ offset: 4, color: '#2563eb' }],
    });

    expect(draw(cell, { x: 20, y: 5, width: 88, height: 34 }).rects).toEqual([
      { x: 24, y: 5, width: 2, height: 34, color: '#2563eb' },
    ]);
  });

  it('draws no rails without rail data and still numbers the row', () => {
    const cell = makeGutterCell({
      depth: 0,
      rowKind: null,
      orphan: false,
      collapsed: false,
      canCollapse: false,
      rowNumber: 12,
    });

    const { rects, texts } = draw(cell);
    expect(rects).toEqual([]);
    expect(texts.map((call) => call.text)).toContain('12');
  });
});

describe('structuralToGutterKind', () => {
  it('maps both begin kinds to their gutter badges', () => {
    expect(structuralToGutterKind('begin_group')).toBe('group');
    expect(structuralToGutterKind('begin_repeat')).toBe('repeat');
  });

  it('leaves end rows and plain rows unchanged', () => {
    expect(structuralToGutterKind('end_group')).toBe('end_group');
    expect(structuralToGutterKind('end_repeat')).toBe('end_repeat');
    expect(structuralToGutterKind(null)).toBeNull();
  });
});
