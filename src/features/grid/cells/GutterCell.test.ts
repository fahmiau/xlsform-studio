import { describe, expect, it } from 'vitest';

import { drawGutter, makeGutterCell, structuralToGutterKind, type GutterCell } from './GutterCell';

interface TextCall {
  text: string;
  x: number;
  y: number;
}

/** Dependency-free canvas double: records `fillText`, accepts every draw verb. */
function fakeContext(): { ctx: CanvasRenderingContext2D; texts: TextCall[] } {
  const texts: TextCall[] = [];
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
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

function draw(cell: GutterCell): TextCall[] {
  const { ctx, texts } = fakeContext();
  const args = {
    ctx,
    rect: { x: 0, y: 0, width: 88, height: 34 },
    theme: {
      fontFamily: 'Inter, sans-serif',
      textLight: '#64748b',
      textMedium: '#334155',
      borderColor: '#cbd5e1',
    },
    cell,
  } as unknown as Parameters<typeof drawGutter>[0];
  drawGutter(args);
  return texts;
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

    expect(draw(cell).map((call) => call.text)).toContain('3');
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

    const texts = draw(cell).map((call) => call.text);
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

    expect(draw(cell).map((call) => call.text)).toEqual([]);
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

    const calls = draw(cell);
    const number = calls.find((call) => call.text === '10');
    const badge = calls.find((call) => call.text === '[G]');
    expect(number).toBeDefined();
    expect(badge).toBeDefined();
    expect(number?.x).toBeLessThan(badge?.x ?? 0);
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
