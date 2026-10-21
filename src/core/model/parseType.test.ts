import { describe, expect, it } from 'vitest';

import { formatType, parseType } from './parseType';

interface Case {
  raw: string;
  base: string;
  listName?: string;
  fileName?: string;
  orOther?: boolean;
}

const CASES: Case[] = [
  { raw: '', base: '' },
  { raw: '   ', base: '' },
  { raw: 'text', base: 'text' },
  { raw: ' Text ', base: 'text' },
  { raw: 'integer', base: 'integer' },
  { raw: 'decimal', base: 'decimal' },
  { raw: 'geopoint', base: 'geopoint' },
  { raw: 'dateTime', base: 'dateTime' },
  { raw: 'datetime', base: 'dateTime' },
  { raw: 'begin_group', base: 'begin_group' },
  { raw: 'begin group', base: 'begin_group' },
  { raw: 'end_repeat', base: 'end_repeat' },
  { raw: 'calculate', base: 'calculate' },
  { raw: 'select_one', base: 'select_one' },
  { raw: 'select_one gender', base: 'select_one', listName: 'gender' },
  { raw: 'select_one    gender', base: 'select_one', listName: 'gender' },
  { raw: 'SELECT_ONE gender', base: 'select_one', listName: 'gender' },
  { raw: 'select one gender', base: 'select_one', listName: 'gender' },
  { raw: 'select_multiple reasons', base: 'select_multiple', listName: 'reasons' },
  { raw: 'select all that apply reasons', base: 'select_multiple', listName: 'reasons' },
  {
    raw: 'select_multiple reasons or_other',
    base: 'select_multiple',
    listName: 'reasons',
    orOther: true,
  },
  { raw: 'select_one yes_no or_other', base: 'select_one', listName: 'yes_no', orOther: true },
  {
    raw: 'select_one_from_file species.csv',
    base: 'select_one_from_file',
    fileName: 'species.csv',
  },
  {
    raw: 'select_multiple_from_file species.csv or_other',
    base: 'select_multiple_from_file',
    fileName: 'species.csv',
    orOther: true,
  },
  { raw: 'rank preferences', base: 'rank', listName: 'preferences' },
  { raw: 'select_one list extra', base: 'select_one', listName: 'list' },
  { raw: 'select_one or_other', base: 'select_one', listName: 'or_other' },
  { raw: 'select_one gender or_other ', base: 'select_one', listName: 'gender', orOther: true },
  // Malformed input never throws.
  { raw: '&&&', base: '&&&' },
  { raw: 'select_one', base: 'select_one' },
  { raw: 'Begin Group', base: 'begin_group' },
];

describe('parseType', () => {
  it.each(CASES)('$raw', (testCase) => {
    const parsed = parseType(testCase.raw);
    expect(parsed.base).toBe(testCase.base);
    expect(parsed.listName).toBe(testCase.listName);
    expect(parsed.fileName).toBe(testCase.fileName);
    expect(parsed.orOther ?? false).toBe(testCase.orOther ?? false);
    expect(parsed.raw).toBe(testCase.raw.trim().replace(/\s+/g, ' '));
  });

  it('preserves the raw text for malformed input', () => {
    expect(parseType('  select_one  my_list  ').raw).toBe('select_one my_list');
  });

  it('formats a parsed type back to text', () => {
    expect(formatType({ base: 'select_one', listName: 'gender' })).toBe('select_one gender');
    expect(formatType({ base: 'select_multiple', listName: 'x', orOther: true })).toBe(
      'select_multiple x or_other',
    );
    expect(formatType({ base: 'select_one_from_file', fileName: 'a.csv' })).toBe(
      'select_one_from_file a.csv',
    );
    expect(formatType({ base: 'text' })).toBe('text');
  });

  it('round-trips every well-formed case through formatType', () => {
    for (const testCase of CASES) {
      if (
        testCase.base === '' ||
        testCase.base === '&&&' ||
        testCase.raw === 'select_one list extra'
      ) {
        continue;
      }
      const parsed = parseType(testCase.raw);
      expect(parseType(formatType(parsed))).toEqual({
        ...parsed,
        raw: formatType(parsed),
      });
    }
  });
});
