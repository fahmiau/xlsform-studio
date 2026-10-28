import { describe, expect, it } from 'vitest';

import { createRow } from '@/core/model/factory';
import type { Row } from '@/core/model/types';

import { flattenChoices } from './flattenChoices';

function byList(entries: Record<string, string[]>): Record<string, Row[]> {
  return Object.fromEntries(
    Object.entries(entries).map(([listName, names]) => [
      listName,
      names.map((name) => createRow({ list_name: listName, name })),
    ]),
  );
}

describe('flattenChoices', () => {
  it('lists each distinct list once in first-appearance order with its count', () => {
    const lists = byList({ gender: ['f', 'm'], yes_no: ['yes', 'no', 'maybe'] });
    const items = flattenChoices(lists);

    expect(items.map(({ listName, count }) => [listName, count])).toEqual([
      ['gender', 2],
      ['yes_no', 3],
    ]);
  });

  it('points at the first choice row of the list', () => {
    const lists = byList({ yes_no: ['yes', 'no'] });
    const firstId = lists.yes_no?.[0]?.id;

    expect(flattenChoices(lists)[0]?.rowId).toBe(firstId);
  });

  it('skips a blank list name defensively', () => {
    const lists = byList({ '': ['orphan'], yes_no: ['yes'] });

    expect(flattenChoices(lists).map((item) => item.listName)).toEqual(['yes_no']);
  });

  it('filters list names case-insensitively and keeps the original casing', () => {
    const lists = byList({ Reason_For_Visit: ['a'], yes_no: ['yes'] });

    expect(flattenChoices(lists, 'REASON').map((item) => item.listName)).toEqual([
      'Reason_For_Visit',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(flattenChoices(byList({ yes_no: ['yes'] }), 'zzz')).toEqual([]);
  });

  it('returns an empty list for a file with no choice lists', () => {
    expect(flattenChoices({})).toEqual([]);
  });
});
