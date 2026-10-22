import { describe, expect, it } from 'vitest';

import { tileFill } from './fill';

describe('fill-handle tiling (Task 2.5)', () => {
  it('tiles a single value down and right', () => {
    expect(tileFill([['x']], 3, 2)).toEqual([
      ['x', 'x'],
      ['x', 'x'],
      ['x', 'x'],
    ]);
  });

  it('repeats the source block modulo its size', () => {
    expect(tileFill([['a', 'b']], 3, 2)).toEqual([
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
    ]);
    expect(tileFill([['a'], ['b']], 3, 1)).toEqual([['a'], ['b'], ['a']]);
  });

  it('does not infer a numeric series', () => {
    expect(tileFill([['1'], ['2']], 4, 1)).toEqual([['1'], ['2'], ['1'], ['2']]);
  });

  it('tiles a single value across the destination width', () => {
    expect(tileFill([['a']], 1, 3)).toEqual([['a', 'a', 'a']]);
  });

  it('fills missing source cells with empty strings', () => {
    expect(tileFill([['a'], []], 2, 2)).toEqual([
      ['a', 'a'],
      ['', ''],
    ]);
  });

  it('returns no rows for an empty source', () => {
    expect(tileFill([], 2, 2)).toEqual([]);
  });
});
