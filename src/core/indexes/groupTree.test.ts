import { describe, expect, it } from 'vitest';

import { createRow } from '../model/factory';
import type { SheetData } from '../model/types';
import { buildGroupTree } from './groupTree';

function sheet(
  rows: Array<Record<string, string>>,
  columns = ['type', 'name', 'label'],
): SheetData {
  return { sheetName: 'survey', columns, rows: rows.map((cells) => createRow(cells)) };
}

describe('buildGroupTree', () => {
  it('builds nested groups, repeats, and question children', () => {
    const survey = sheet([
      { type: 'begin_group', name: 'outer', label: 'Outer' },
      { type: 'text', name: 'q1', label: 'Q1' },
      { type: 'begin_repeat', name: 'inner', label: 'Inner' },
      { type: 'text', name: 'q2', label: 'Q2' },
      { type: 'end_repeat' },
      { type: 'end_group' },
      { type: 'text', name: 'top', label: 'Top' },
    ]);

    const tree = buildGroupTree(survey);
    expect(tree.roots).toHaveLength(1);
    const outer = tree.roots[0]!;
    expect(outer).toMatchObject({
      name: 'outer',
      groupType: 'group',
      startRowIndex: 0,
      endRowIndex: 5,
      depth: 0,
      collapsed: false,
    });
    expect(outer.children).toHaveLength(2);
    expect(outer.children[1]).toMatchObject({
      name: 'inner',
      groupType: 'repeat',
      startRowIndex: 2,
      endRowIndex: 4,
      depth: 1,
    });
    expect((outer.children[1] as { children: unknown[] }).children).toHaveLength(1);
    expect(outer.children[0]).toMatchObject({ name: 'q1', type: 'text', rowIndex: 1 });
    expect(tree.groups).toHaveLength(2);
    expect(tree.matchingEnd.get(survey.rows[0]?.id ?? '')).toBe(survey.rows[5]?.id);
    expect(tree.matchingEnd.get(survey.rows[2]?.id ?? '')).toBe(survey.rows[4]?.id);
    expect(tree.matchingEnd.size).toBe(2);
    expect([...tree.depthByRowIndex]).toEqual([0, 1, 1, 2, 1, 0, 0]);
    expect(tree.orphans).toEqual([]);
  });

  it('marks unclosed groups with endRowIndex = -1', () => {
    const survey = sheet([
      { type: 'begin_group', name: 'open', label: 'Open' },
      { type: 'text', name: 'q1', label: 'Q1' },
    ]);
    const tree = buildGroupTree(survey);
    expect(tree.roots[0]).toMatchObject({ name: 'open', startRowIndex: 0, endRowIndex: -1 });
    expect(tree.matchingEnd.size).toBe(0);
  });

  it('reports mismatched closing tags as orphans and leaves the group open', () => {
    const survey = sheet([
      { type: 'begin_group', name: 'g', label: 'G' },
      { type: 'text', name: 'q', label: 'Q' },
      { type: 'end_repeat' },
      { type: 'end_group' },
    ]);
    const tree = buildGroupTree(survey);
    expect(tree.orphans).toEqual([survey.rows[2]?.id]);
    expect(tree.roots[0]?.endRowIndex).toBe(3);
    expect(tree.matchingEnd.size).toBe(1);
  });

  it('collects stray end tags', () => {
    const survey = sheet([
      { type: 'end_group' },
      { type: 'end_repeat' },
      { type: 'text', name: 'q' },
    ]);
    const tree = buildGroupTree(survey);
    expect(tree.orphans).toEqual([survey.rows[0]?.id, survey.rows[1]?.id]);
    expect(tree.roots).toEqual([]);
  });

  it('handles an empty form', () => {
    const tree = buildGroupTree(sheet([]));
    expect(tree.roots).toEqual([]);
    expect(tree.groups).toEqual([]);
    expect(tree.depthByRowIndex).toHaveLength(0);
    expect(tree.orphans).toEqual([]);
  });

  it('uses the requested language for group labels', () => {
    const survey = sheet(
      [
        {
          type: 'begin_group',
          name: 'g',
          'label::English (en)': 'Group',
          'label::Indonesian (id)': 'Grup',
        },
        { type: 'end_group' },
      ],
      ['type', 'name', 'label::English (en)', 'label::Indonesian (id)'],
    );
    expect(buildGroupTree(survey).roots[0]?.label).toBe('Group');
    expect(buildGroupTree(survey, { defaultLanguage: 'Indonesian' }).roots[0]?.label).toBe('Grup');
  });
});
