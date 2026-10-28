import { describe, expect, it } from 'vitest';

import { buildGroupTree } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

import {
  buildProjection,
  identityProjection,
  realIndexesFor,
  realRowIndex,
  rowAt,
  visibleRowCount,
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
    expect(Array.from(projection.realIndexes)).toEqual([0, 1, 2]);
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

function groupedSheet(): SheetData {
  const rows = [
    ['begin_group', 'outer'],
    ['begin_repeat', 'inner'],
    ['text', 'a'],
    ['end_repeat', ''],
    ['text', 'b'],
    ['end_group', ''],
    ['text', 'c'],
    ['begin_group', 'open'],
    ['text', 'd'],
  ] as const;
  return {
    sheetName: 'survey',
    columns: ['type', 'name'],
    rows: rows.map(([type, name], index) => ({
      id: `r${index}`,
      cells: { type, ...(name ? { name } : {}) },
    })),
  };
}

describe('buildProjection folding (Task 3.7)', () => {
  it('hides rows between a collapsed begin and its matching end', () => {
    const sheet = groupedSheet();
    const groups = buildGroupTree(sheet);
    const projection = buildProjection(sheet, { groups, collapsed: new Set(['r0']) });
    expect(Array.from(projection.realIndexes)).toEqual([0, 5, 6, 7, 8]);
    expect(visibleRowCount(projection)).toBe(5);
    expect(visibleRowIndex(projection, 2)).toBe(-1);
    expect(visibleRowIndex(projection, 5)).toBe(1);
    expect(rowAt(sheet, projection, 1)?.id).toBe('r5');
  });

  it('handles nested collapses without leaking hidden rows', () => {
    const sheet = groupedSheet();
    const groups = buildGroupTree(sheet);
    const projection = buildProjection(sheet, {
      groups,
      collapsed: new Set(['r0', 'r1']),
    });
    expect(Array.from(projection.realIndexes)).toEqual([0, 5, 6, 7, 8]);

    const innerOnly = buildProjection(sheet, { groups, collapsed: new Set(['r1']) });
    expect(Array.from(innerOnly.realIndexes)).toEqual([0, 1, 3, 4, 5, 6, 7, 8]);
  });

  it('never collapses unclosed groups', () => {
    const sheet = groupedSheet();
    const groups = buildGroupTree(sheet);
    const projection = buildProjection(sheet, { groups, collapsed: new Set(['r7']) });
    expect(Array.from(projection.realIndexes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('restores every row when nothing is collapsed', () => {
    const sheet = groupedSheet();
    expect(Array.from(buildProjection(sheet).realIndexes)).toEqual(
      Array.from(identityProjection(sheet).realIndexes),
    );
  });

  it('maps visible selections to real indexes across hidden regions', () => {
    const sheet = groupedSheet();
    const groups = buildGroupTree(sheet);
    const projection = buildProjection(sheet, { groups, collapsed: new Set(['r0']) });
    expect(realIndexesFor(projection, [4, 1, 0, 99])).toEqual([0, 5, 8]);
  });

  it('keeps 1-based sheet row numbers stable when a group collapses', () => {
    // Group begins at sheet row 10 (index 9) and ends at sheet row 20 (index 19).
    const rows: SheetData['rows'] = Array.from({ length: 21 }, (_, index) => ({
      id: `r${index}`,
      cells: {
        type: index === 9 ? 'begin_group' : index === 19 ? 'end_group' : 'text',
      },
    }));
    const sheet: SheetData = { sheetName: 'survey', columns: ['type'], rows };
    const groups = buildGroupTree(sheet);
    const projection = buildProjection(sheet, { groups, collapsed: new Set(['r9']) });

    const visibleNumbers = Array.from(projection.realIndexes, (real) => real + 1);
    expect(visibleNumbers.slice(-3)).toEqual([10, 20, 21]);
  });
});
