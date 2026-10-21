import { describe, expect, it } from 'vitest';

import { createRow } from '../model/factory';
import type { SheetData } from '../model/types';
import { buildVariableMap } from './variables';

function sheet(columns: string[], rows: Array<Record<string, string>>): SheetData {
  return {
    sheetName: 'survey',
    columns,
    rows: rows.map((cells) => createRow(cells)),
  };
}

describe('buildVariableMap', () => {
  it('indexes questions, groups, and repeats with their group path', () => {
    const survey = sheet(
      ['type', 'name', 'label'],
      [
        { type: 'begin_group', name: 'household', label: 'Household' },
        { type: 'text', name: 'head_name', label: 'Head name' },
        { type: 'begin_repeat', name: 'members', label: 'Members' },
        { type: 'integer', name: 'age', label: 'Age' },
        { type: 'end_repeat' },
        { type: 'end_group' },
        { type: 'select_one gender', name: 'gender', label: 'Gender' },
      ],
    );

    const index = buildVariableMap(survey);
    expect(Object.keys(index.variables)).toEqual([
      'household',
      'head_name',
      'members',
      'age',
      'gender',
    ]);
    expect(index.variables.household).toMatchObject({
      rowIndex: 0,
      questionType: 'begin_group',
      groupPath: [],
      primaryLabel: 'Household',
    });
    expect(index.variables.head_name?.groupPath).toEqual(['household']);
    expect(index.variables.members?.groupPath).toEqual(['household']);
    expect(index.variables.age?.groupPath).toEqual(['household', 'members']);
    expect(index.variables.gender?.listName).toBe('gender');
    expect(index.order).toHaveLength(5);
  });

  it('keeps exact duplicate names in duplicates and preserves the first metadata', () => {
    const survey = sheet(
      ['type', 'name', 'label'],
      [
        { type: 'text', name: 'dup', label: 'First' },
        { type: 'text', name: 'dup', label: 'Second' },
        { type: 'text', name: 'dup', label: 'Third' },
        { type: 'text', name: 'unique', label: 'Unique' },
      ],
    );
    const index = buildVariableMap(survey);
    expect(index.duplicates.dup).toHaveLength(3);
    expect(index.variables.dup?.primaryLabel).toBe('First');
    expect(index.order).toHaveLength(4);
    expect(index.duplicates.unique).toBeUndefined();
  });

  it('ignores rows without a name and end tags', () => {
    const survey = sheet(
      ['type', 'name'],
      [
        { type: 'note' },
        { type: 'text', name: '   ' },
        { type: 'end_group' },
        { type: 'text', name: 'kept' },
      ],
    );
    const index = buildVariableMap(survey);
    expect(Object.keys(index.variables)).toEqual(['kept']);
  });

  it('uses the default language label, then a plain label, then the first localized one', () => {
    const columns = ['type', 'name', 'label::English (en)', 'label::Indonesian (id)'];
    const survey = sheet(columns, [
      {
        type: 'text',
        name: 'q1',
        'label::English (en)': 'English',
        'label::Indonesian (id)': 'Indonesian',
      },
    ]);
    expect(buildVariableMap(survey).variables.q1?.primaryLabel).toBe('English');
    expect(
      buildVariableMap(survey, { defaultLanguage: 'Indonesian' }).variables.q1?.primaryLabel,
    ).toBe('Indonesian');
    expect(buildVariableMap(survey, { defaultLanguage: 'id' }).variables.q1?.primaryLabel).toBe(
      'Indonesian',
    );

    const plain = sheet(['type', 'name', 'label'], [{ type: 'text', name: 'q2', label: 'Plain' }]);
    expect(buildVariableMap(plain).variables.q2?.primaryLabel).toBe('Plain');

    const onlyLocalized = sheet(
      ['type', 'name', 'label::French (fr)'],
      [{ type: 'text', name: 'q3', 'label::French (fr)': 'Bonjour' }],
    );
    expect(buildVariableMap(onlyLocalized).variables.q3?.primaryLabel).toBe('Bonjour');
  });

  it('handles an empty survey', () => {
    const index = buildVariableMap({ sheetName: 'survey', columns: ['type', 'name'], rows: [] });
    expect(index.variables).toEqual({});
    expect(index.duplicates).toEqual({});
    expect(index.order).toEqual([]);
  });
});
