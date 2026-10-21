import { describe, expect, it } from 'vitest';

import { createRow } from '../model/factory';
import type { SheetData } from '../model/types';
import { buildChoicesByList } from './choices';

function sheet(
  sheetName: string,
  columns: string[],
  rows: Array<Record<string, string>>,
): SheetData {
  return { sheetName, columns, rows: rows.map((cells) => createRow(cells)) };
}

describe('buildChoicesByList', () => {
  it('groups choices by list name, preserving order', () => {
    const choices = sheet(
      'choices',
      ['list_name', 'name', 'label'],
      [
        { list_name: 'gender', name: 'f', label: 'Female' },
        { list_name: 'yes_no', name: 'y', label: 'Yes' },
        { list_name: 'gender', name: 'm', label: 'Male' },
        { list_name: '  ', name: 'ignored' },
        { name: 'no_list' },
      ],
    );
    const index = buildChoicesByList(choices);
    expect(Object.keys(index.byList)).toEqual(['gender', 'yes_no']);
    expect(index.byList.gender?.map((row) => row.cells.name)).toEqual(['f', 'm']);
    expect(index.listUsage).toEqual({});
  });

  it('records which survey rows reference each list', () => {
    const choices = sheet('choices', ['list_name', 'name'], [{ list_name: 'gender', name: 'f' }]);
    const survey = sheet(
      'survey',
      ['type', 'name'],
      [
        { type: 'select_one gender', name: 'q1' },
        { type: 'select_multiple gender', name: 'q2' },
        { type: 'select_one other', name: 'q3' },
        { type: 'text', name: 'q4' },
      ],
    );
    const index = buildChoicesByList(choices, survey);
    expect(index.listUsage.gender).toEqual([survey.rows[0]?.id, survey.rows[1]?.id]);
    expect(index.listUsage.other).toEqual([survey.rows[2]?.id]);
    expect(index.listUsage.missing).toBeUndefined();
  });
});
