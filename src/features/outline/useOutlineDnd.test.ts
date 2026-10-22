import { describe, expect, it } from 'vitest';

import { buildGroupTree } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

import { flattenOutline } from './flattenTree';
import { planOutlineMove } from './useOutlineDnd';

function sheet(): SheetData {
  const rows = [
    ['text', 'a', 'A'],
    ['begin_group', 'g1', 'G1'],
    ['text', 'b', 'B'],
    ['end_group', '', ''],
    ['text', 'c', 'C'],
    ['begin_group', 'g2', 'G2'],
    ['text', 'd', 'D'],
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

const items = () => flattenOutline(sheet(), buildGroupTree(sheet()));

describe('planOutlineMove (Task 3.10)', () => {
  it('moves a question before and after another row', () => {
    expect(planOutlineMove(items(), 'r4', 'before:r0').plan).toMatchObject({
      sourceStart: 4,
      sourceEnd: 4,
      targetIndex: 0,
    });
    expect(planOutlineMove(items(), 'r0', 'after:r4').plan).toMatchObject({
      sourceStart: 0,
      sourceEnd: 0,
      targetIndex: 5,
    });
  });

  it('moves a whole group block', () => {
    expect(planOutlineMove(items(), 'r1', 'after:r6').plan).toMatchObject({
      sourceStart: 1,
      sourceEnd: 3,
      targetIndex: 7,
    });
  });

  it('drops inside a group as its first child', () => {
    expect(planOutlineMove(items(), 'r4', 'inside:r1').plan).toMatchObject({
      targetIndex: 2,
    });
  });

  it('rejects moving a block into itself', () => {
    expect(planOutlineMove(items(), 'r1', 'inside:r1').ok).toBe(false);
    expect(planOutlineMove(items(), 'r1', 'before:r2').ok).toBe(false);
  });

  it('rejects inside/question and unbalanced targets', () => {
    expect(planOutlineMove(items(), 'r4', 'inside:r0').ok).toBe(false);

    const unclosed = sheet();
    unclosed.rows.push({ id: 'r8', cells: { type: 'begin_group', name: 'open' } });
    const unclosedItems = flattenOutline(unclosed, buildGroupTree(unclosed));
    expect(planOutlineMove(unclosedItems, 'r0', 'inside:r8').ok).toBe(false);
    expect(planOutlineMove(unclosedItems, 'r8', 'after:r0').ok).toBe(false);
  });

  it('is a no-op for adjacent drops', () => {
    const check = planOutlineMove(items(), 'r1', 'before:r0');
    expect(check.ok).toBe(true);
    const noop = planOutlineMove(items(), 'r4', 'after:r4');
    expect(noop.ok).toBe(false);
  });

  it('rejects missing targets and invalid ids', () => {
    expect(planOutlineMove(items(), 'r0', null).ok).toBe(false);
    expect(planOutlineMove(items(), null, 'before:r0').ok).toBe(false);
    expect(planOutlineMove(items(), 'r0', 'nonsense').ok).toBe(false);
    expect(planOutlineMove(items(), 'r0', 'before:missing').ok).toBe(false);
  });
});
