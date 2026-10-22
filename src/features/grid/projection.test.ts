import { describe, expect, it } from 'vitest';

import type { SheetData } from '@/core/model/types';

import {
  identityProjection,
  realIndexesFor,
  realRowIndex,
  rowAt,
  visibleRowIndex,
} from './projection';

const sheet: SheetData = {
  sheetName: 'survey',
  columns: ['type'],
  rows: [
    { id: 'r0', cells: {} },
    { id: 'r1', cells: {} },
    { id: 'r2', cells: {} },
  ],
};

describe('row projection (Task 2.2)', () => {
  it('is the identity for now', () => {
    const projection = identityProjection(sheet);
    expect([...projection.realIndexes]).toEqual([0, 1, 2]);
    expect(realRowIndex(projection, 2)).toBe(2);
    expect(visibleRowIndex(projection, 1)).toBe(1);
    expect(rowAt(sheet, projection, 1)?.id).toBe('r1');
  });

  it('returns -1 outside the projection', () => {
    const projection = identityProjection(sheet);
    expect(realRowIndex(projection, 9)).toBe(-1);
    expect(visibleRowIndex(projection, 9)).toBe(-1);
    expect(rowAt(sheet, projection, 9)).toBeUndefined();
  });

  it('maps visible selections to real indexes', () => {
    expect(realIndexesFor(identityProjection(sheet), [2, 0])).toEqual([0, 2]);
  });
});
