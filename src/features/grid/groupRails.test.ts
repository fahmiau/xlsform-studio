import { describe, expect, it } from 'vitest';

import { buildGroupTree, type GroupTreeIndex } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

import { buildGroupRails, type GutterRail } from './groupRails';

const PALETTE = ['#dc2626', '#16a34a', '#2563eb'] as const;

function sheetFromRows(rows: readonly (readonly [type: string, name?: string])[]): SheetData {
  return {
    sheetName: 'survey',
    columns: ['type', 'name'],
    rows: rows.map(([type, name], index) => ({
      id: `r${index}`,
      cells: { type, ...(name ? { name } : {}) },
    })),
  };
}

function railsFor(rows: readonly (readonly [type: string, name?: string])[]): GutterRail[][] {
  const sheet = sheetFromRows(rows);
  return buildGroupRails(sheet, buildGroupTree(sheet), PALETTE);
}

const red: GutterRail = { offset: 1, color: '#dc2626' };
const green: GutterRail = { offset: 1, color: '#16a34a' };
const blue: GutterRail = { offset: 1, color: '#2563eb' };

describe('buildGroupRails', () => {
  it('gives each sibling group its own color and leaves outside rows empty', () => {
    const rails = railsFor([
      ['begin_group', 'first'],
      ['text', 'a'],
      ['end_group'],
      ['begin_group', 'second'],
      ['text', 'b'],
      ['end_group'],
      ['text', 'c'],
    ]);

    expect(rails[0]).toEqual([red]);
    expect(rails[1]).toEqual([red]);
    expect(rails[2]).toEqual([red]);
    expect(rails[3]).toEqual([green]);
    expect(rails[4]).toEqual([green]);
    expect(rails[5]).toEqual([green]);
    expect(rails[6]).toEqual([]);
  });

  it('stacks a nested child rail to the right of its parent', () => {
    const rails = railsFor([
      ['begin_group', 'outer'],
      ['begin_group', 'inner'],
      ['text', 'a'],
      ['end_group'],
      ['end_group'],
    ]);

    expect(rails[1]).toEqual([red, { offset: 4, color: '#16a34a' }]);
    expect(rails[2]).toEqual([red, { offset: 4, color: '#16a34a' }]);
    expect(rails[0]).toEqual([red]);
    // The end row belongs to the span, so the child's rail is still there.
    expect(rails[3]).toEqual([red, { offset: 4, color: '#16a34a' }]);
    expect(rails[4]).toEqual([red]);
  });

  it('runs an unclosed group through the last row', () => {
    const rails = railsFor([
      ['begin_group', 'open'],
      ['text', 'a'],
      ['text', 'b'],
    ]);

    expect(rails[0]).toEqual([red]);
    expect(rails[1]).toEqual([red]);
    expect(rails[2]).toEqual([red]);
  });

  it('honors the base offset, offset step, and depth cap options', () => {
    const sheet = sheetFromRows([
      ['begin_group', 'd0'],
      ['begin_group', 'd1'],
      ['begin_group', 'd2'],
      ['begin_group', 'd3'],
      ['text', 'leaf'],
      ['end_group'],
      ['end_group'],
      ['end_group'],
      ['end_group'],
    ]);
    const rails = buildGroupRails(sheet, buildGroupTree(sheet), PALETTE, {
      baseOffset: 2,
      offsetStep: 5,
      maxDepth: 2,
    });

    expect(rails[4]).toEqual([
      { offset: 2, color: '#dc2626' },
      { offset: 7, color: '#16a34a' },
      { offset: 12, color: '#2563eb' },
      { offset: 12, color: '#dc2626' },
    ]);
  });

  it('returns empty arrays when there are no groups', () => {
    const rails = railsFor([
      ['text', 'a'],
      ['text', 'b'],
    ]);

    expect(rails).toEqual([[], []]);
  });

  it('draws nothing when the palette is empty', () => {
    const sheet = sheetFromRows([['begin_group', 'g'], ['text', 'a'], ['end_group']]);
    const rails = buildGroupRails(sheet, buildGroupTree(sheet), []);

    expect(rails).toEqual([[], [], []]);
  });

  it('clamps group spans to the sheet and skips inverted spans', () => {
    const sheet = sheetFromRows([
      ['text', 'a'],
      ['text', 'b'],
    ]);
    const groups: GroupTreeIndex = {
      roots: [],
      groups: [
        {
          id: 'g0',
          name: 'past-end',
          label: '',
          groupType: 'group',
          startRowIndex: 1,
          endRowIndex: 9,
          depth: 0,
          collapsed: false,
          children: [],
        },
        {
          id: 'g1',
          name: 'inverted',
          label: '',
          groupType: 'group',
          startRowIndex: 1,
          endRowIndex: 0,
          depth: 0,
          collapsed: false,
          children: [],
        },
      ],
      depthByRowIndex: new Int16Array(2),
      matchingEnd: new Map(),
      orphans: [],
    };

    const rails = buildGroupRails(sheet, groups, PALETTE);

    expect(rails[1]).toEqual([red]);
    expect(rails[0]).toEqual([]);
    expect(rails).toHaveLength(2);
  });

  it('keeps cycling the palette when there are more groups than colors', () => {
    const rails = railsFor([
      ['begin_group', 'one'],
      ['end_group'],
      ['begin_group', 'two'],
      ['end_group'],
      ['begin_group', 'three'],
      ['end_group'],
      ['begin_group', 'four'],
      ['end_group'],
    ]);

    expect(rails[5]).toEqual([blue]);
    expect(rails[7]).toEqual([red]);
  });
});
