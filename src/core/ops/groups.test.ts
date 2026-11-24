import { describe, expect, it } from 'vitest';

import { buildGroupTree } from '../indexes/groupTree';
import { createEmptyWorkbook, createRow } from '../model/factory';
import type { WorkbookData } from '../model/types';
import { moveBlock } from './rows';
import {
  checkSelectionBalance,
  deleteGroupWithContents,
  groupContainingRow,
  groupHiddenCount,
  groupHiddenQuestionCount,
  suggestGroupName,
  unwrapGroup,
  wrapSelection,
} from './groups';

function withRows(spec: Array<[string, string, string?]>): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows = spec.map(([type, name, label]) =>
    createRow({ type, name, ...(label ? { label } : {}) }),
  );
  return data;
}

const types = (data: WorkbookData) => data.survey.rows.map((row) => row.cells.type);
const names = (data: WorkbookData) => data.survey.rows.map((row) => row.cells.name ?? '');

function balanced(): WorkbookData {
  return withRows([
    ['begin_group', 'outer'],
    ['begin_repeat', 'inner'],
    ['text', 'a'],
    ['end_repeat', ''],
    ['text', 'b'],
    ['end_group', ''],
    ['text', 'c'],
  ]);
}

describe('selection balance (Task 3.8)', () => {
  it('accepts a whole group and a block inside a group', () => {
    const data = balanced();
    expect(checkSelectionBalance(data.survey, 0, 5).ok).toBe(true);
    expect(checkSelectionBalance(data.survey, 1, 3).ok).toBe(true);
    expect(checkSelectionBalance(data.survey, 6, 6).ok).toBe(true);
  });

  it('rejects selections that cut through a group', () => {
    const data = balanced();
    expect(checkSelectionBalance(data.survey, 2, 4).ok).toBe(false);
    expect(checkSelectionBalance(data.survey, 2, 5).ok).toBe(false);
    expect(checkSelectionBalance(data.survey, 2, 2).ok).toBe(true);
  });

  it('rejects unclosed groups and orphan end rows', () => {
    const unclosed = withRows([
      ['begin_group', 'open'],
      ['text', 'a'],
    ]);
    expect(checkSelectionBalance(unclosed.survey, 0, 1).reason).toMatch(/unclosed/);

    const orphan = withRows([
      ['text', 'a'],
      ['end_group', ''],
    ]);
    expect(checkSelectionBalance(orphan.survey, 0, 1).reason).toMatch(/without an open group/);
  });

  it('rejects empty selections', () => {
    const data = withRows([]);
    expect(checkSelectionBalance(data.survey, 0, 0).ok).toBe(false);
  });
});

describe('wrapSelection (Task 3.8)', () => {
  it('wraps a balanced selection exactly once', () => {
    const data = withRows([
      ['text', 'a'],
      ['text', 'b'],
      ['text', 'c'],
    ]);
    const result = wrapSelection(data, 0, 1, 'group');
    expect(types(result.data)).toEqual(['begin_group', 'text', 'text', 'end_group', 'text']);
    expect(result.data.survey.rows[0]?.id).toBe(result.rowId);
    expect(data.survey.rows).toHaveLength(3);
  });

  it('suggests a free name and accepts a provided one', () => {
    const data = withRows([
      ['text', 'group_1'],
      ['text', 'a'],
    ]);
    expect(suggestGroupName(data, 'group')).toBe('group_1_2');
    const wrapped = wrapSelection(data, 1, 1, 'repeat', { name: 'members' });
    expect(names(wrapped.data)).toEqual(['group_1', 'members', 'a', '']);
    expect(wrapped.data.survey.columns).toContain('repeat_count');
  });

  it('rejects an unbalanced selection with an explanation', () => {
    const data = balanced();
    const result = wrapSelection(data, 2, 4, 'group');
    expect(result.data).toBe(data);
    expect(result.reason).toMatch(/cuts through/);
  });

  it('wraps inside the existing parent', () => {
    const data = balanced();
    const result = wrapSelection(data, 4, 4, 'group');
    expect(types(result.data)).toEqual([
      'begin_group',
      'begin_repeat',
      'text',
      'end_repeat',
      'begin_group',
      'text',
      'end_group',
      'end_group',
      'text',
    ]);
  });
});

describe('unwrap and delete (Task 3.8)', () => {
  it('unwraps exactly the pair and keeps contents', () => {
    const data = balanced();
    const groupId = data.survey.rows[0]!.id;
    const next = unwrapGroup(data, groupId);
    expect(types(next)).toEqual(['begin_repeat', 'text', 'end_repeat', 'text', 'text']);
  });

  it('deletes a whole block including nested rows', () => {
    const data = balanced();
    const groupId = data.survey.rows[0]!.id;
    const next = deleteGroupWithContents(data, groupId);
    expect(types(next)).toEqual(['text']);
  });

  it('deletes an unclosed group to the end of the sheet', () => {
    const data = withRows([
      ['text', 'a'],
      ['begin_group', 'open'],
      ['text', 'b'],
    ]);
    const next = deleteGroupWithContents(data, data.survey.rows[1]!.id);
    expect(types(next)).toEqual(['text']);
  });

  it('is a no-op for missing or unclosed unwraps', () => {
    const data = balanced();
    expect(unwrapGroup(data, 'missing')).toBe(data);
    const unclosed = withRows([['begin_group', 'open']]);
    expect(unwrapGroup(unclosed, unclosed.survey.rows[0]!.id)).toBe(unclosed);
  });
});

describe('group helpers', () => {
  it('finds the innermost containing group and counts hidden rows', () => {
    const data = balanced();
    const tree = buildGroupTree(data.survey);
    expect(groupContainingRow(tree.groups, 2)?.name).toBe('inner');
    expect(groupContainingRow(tree.groups, 4)?.name).toBe('outer');
    expect(groupContainingRow(tree.groups, 6)).toBeUndefined();
    expect(groupHiddenCount(tree.groups[0]!)).toBe(4);
    expect(groupHiddenQuestionCount(data.survey, tree.groups[0]!)).toBe(2);
    expect(groupHiddenQuestionCount(data.survey, tree.groups[1]!)).toBe(1);
    expect(groupHiddenCount({ ...tree.groups[0]!, endRowIndex: -1 })).toBe(0);
  });
});

describe('moveBlock (Task 3.10)', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'];
  function data() {
    return withRows(rows.map((name) => ['text', name]));
  }
  const order = (next: WorkbookData) => names(next).join('');
  const move = (fromStart: number, fromEnd: number, toIndex: number) =>
    order(moveBlock(data(), 'survey', fromStart, fromEnd, toIndex));

  it('moves a block up', () => {
    expect(move(3, 4, 1)).toBe('adebcf');
  });

  it('moves a block down', () => {
    expect(move(1, 2, 4)).toBe('adbcef');
  });

  it('moves to the top and to the end', () => {
    expect(move(4, 5, 0)).toBe('efabcd');
    expect(move(0, 1, 6)).toBe('cdefab');
  });

  it('keeps internal order when moving a group block', () => {
    expect(move(1, 3, 6)).toBe('aefbcd');
  });

  it('treats drops at the block edges and inside as no-ops', () => {
    const original = data();
    expect(moveBlock(original, 'survey', 1, 3, 1)).toBe(original);
    expect(moveBlock(original, 'survey', 1, 3, 2)).toBe(original);
    expect(moveBlock(original, 'survey', 1, 3, 4)).toBe(original);
  });

  it('accepts reversed indexes and clamps out-of-range targets', () => {
    expect(move(3, 1, 0)).toBe('bcdaef');
    expect(move(4, 5, 99)).toBe('abcdef');
  });

  it('is a no-op for empty sheets and invalid ranges', () => {
    const empty = withRows([]);
    expect(moveBlock(empty, 'survey', 0, 0, 0)).toBe(empty);
    const original = data();
    expect(order(moveBlock(original, 'survey', 4, 2, 0))).toBe(
      order(moveBlock(original, 'survey', 2, 4, 0)),
    );
  });

  it('does not mutate the input', () => {
    const original = data();
    moveBlock(original, 'survey', 0, 1, 4);
    expect(names(original).join('')).toBe('abcdef');
  });
});
