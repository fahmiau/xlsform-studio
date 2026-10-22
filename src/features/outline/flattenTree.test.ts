import { describe, expect, it } from 'vitest';

import { buildGroupTree } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

import { flattenOutline } from './flattenTree';

function sheet(): SheetData {
  const rows = [
    ['text', 'intro', 'Intro'],
    ['begin_group', 'household', 'Household'],
    ['select_one yes_no', 'consent', 'Consent?'],
    ['begin_repeat', 'members', 'Members'],
    ['text', 'member_name', 'Member name'],
    ['end_repeat', '', ''],
    ['end_group', '', ''],
    ['text', 'closing', 'Closing'],
    ['end_group', '', ''],
  ] as const;
  return {
    sheetName: 'survey',
    columns: ['type', 'name', 'label'],
    rows: rows.map(([type, name, label], index) => ({
      id: `r${index}`,
      cells: { type, ...(name ? { name } : {}), ...(label ? { label } : {}) },
    })),
  };
}

describe('flattenOutline (Task 3.9)', () => {
  it('lists root questions, groups, repeats, and questions in document order', () => {
    const data = sheet();
    const items = flattenOutline(data, buildGroupTree(data));
    expect(items.map((item) => [item.kind, item.name])).toEqual([
      ['question', 'intro'],
      ['group', 'household'],
      ['question', 'consent'],
      ['repeat', 'members'],
      ['question', 'member_name'],
      ['question', 'closing'],
      ['orphan', ''],
    ]);
    expect(items[3]?.depth).toBe(1);
    expect(items[4]?.depth).toBe(2);
  });

  it('carries collapse state and hidden-row ranges', () => {
    const data = sheet();
    const items = flattenOutline(data, buildGroupTree(data), {
      collapsed: new Set(['r1']),
    });
    const group = items.find((item) => item.rowId === 'r1');
    expect(group?.collapsed).toBe(true);
    expect(group?.startIndex).toBe(1);
    expect(group?.endIndex).toBe(6);
    expect(items.map((item) => item.name)).toEqual(['intro', 'household', 'closing', '']);
  });

  it('shows orphan end rows at the root with a warning state', () => {
    const data = sheet();
    const items = flattenOutline(data, buildGroupTree(data));
    const orphan = items.find((item) => item.kind === 'orphan');
    expect(orphan?.rowId).toBe('r8');
    expect(orphan?.depth).toBe(0);
    expect(orphan?.missingEnd).toBe(true);
  });

  it('filters by name/label and keeps ancestor groups', () => {
    const data = sheet();
    const tree = buildGroupTree(data);
    const items = flattenOutline(data, tree, { filter: 'member_name' });
    expect(items.map((item) => item.name)).toEqual(['household', 'members', 'member_name']);
  });

  it('keeps descendants when a group itself matches', () => {
    const data = sheet();
    const items = flattenOutline(data, buildGroupTree(data), { filter: 'household' });
    expect(items.map((item) => item.name)).toEqual([
      'household',
      'consent',
      'members',
      'member_name',
    ]);
  });

  it('matches type text and returns an empty list when nothing matches', () => {
    const data = sheet();
    const tree = buildGroupTree(data);
    expect(flattenOutline(data, tree, { filter: 'select_one' }).map((item) => item.name)).toEqual([
      'household',
      'consent',
    ]);
    expect(flattenOutline(data, tree, { filter: 'zzz' })).toEqual([]);
  });
});
