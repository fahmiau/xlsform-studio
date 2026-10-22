// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SheetData } from '../model/types';
import { readWorkbook } from '../xlsx/read';
import { buildChoicesByList } from './choices';
import { buildGroupTree } from './groupTree';
import { buildVariableMap } from './variables';

const FIXTURES = join(process.cwd(), 'tests/fixtures/xlsx/synthetic');

async function readFixture(name: string) {
  return readWorkbook(new Uint8Array(await readFile(join(FIXTURES, name))));
}

function sheet(columns: string[], rows: string[][]): SheetData {
  return {
    sheetName: 'survey',
    columns,
    rows: rows.map((cells, index) => ({
      id: `row${index}`,
      cells: Object.fromEntries(
        columns
          .map((column, columnIndex) => [column, cells[columnIndex] ?? ''] as const)
          .filter(([, value]) => value !== ''),
      ),
    })),
  };
}

describe('indexes over alias and mixed-case headers (review M2)', () => {
  it('builds variables, choice lists, and usage for real fixture 03-aliases', async () => {
    const { data } = await readFixture('03-aliases.xlsx');
    const variables = buildVariableMap(data.survey);
    expect(Object.keys(variables.variables)).toEqual(['gender', 'reasons', 'years']);
    expect(variables.variables.gender?.questionType).toBe('select_one');
    expect(variables.variables.gender?.listName).toBe('gender');
    expect(variables.variables.gender?.primaryLabel).toBe('Gender');
    expect(variables.variables.reasons?.questionType).toBe('select_multiple');

    const choices = buildChoicesByList(data.choices, data.survey);
    expect(choices.byList.gender?.map((row) => row.cells.name)).toEqual(['female', 'male']);
    expect(choices.byList.reason).toHaveLength(1);
    expect(choices.listUsage.gender).toEqual([data.survey.rows[0]?.id]);
    expect(choices.listUsage.reason).toEqual([data.survey.rows[1]?.id]);
  });

  it('builds variables and choice lists for real fixture 05-mixed-case', async () => {
    const { data } = await readFixture('05-mixed-case.xlsx');
    const variables = buildVariableMap(data.survey);
    expect(Object.keys(variables.variables)).toEqual(['comments', 'score']);
    expect(variables.variables.score?.questionType).toBe('integer');
    expect(variables.variables.score?.primaryLabel).toBe('Score');

    const choices = buildChoicesByList(data.choices, data.survey);
    expect(choices.byList.answers?.map((row) => row.cells.Name)).toEqual(['one', 'two']);
    expect(choices.listUsage.answers).toBeUndefined();
  });

  it('builds the group tree from mixed-case structural headers', () => {
    const survey = sheet(
      [' Type ', 'NAME', 'Label'],
      [
        ['begin_group', 'outer', 'Outer'],
        ['begin_repeat', 'members', 'Members'],
        ['text', 'member_name', 'Member name'],
        ['end_repeat', '', ''],
        ['end_group', '', ''],
      ],
    );
    const tree = buildGroupTree(survey);
    expect(tree.groups.map((group) => group.name)).toEqual(['outer', 'members']);
    expect(tree.groups[1]?.depth).toBe(1);
    expect(tree.groups[0]?.endRowIndex).toBe(4);

    const variables = buildVariableMap(survey);
    expect(variables.variables.member_name?.groupPath).toEqual(['outer', 'members']);
  });

  it('does not pop the wrong group on a mismatched end tag (review m4)', () => {
    const survey = sheet(
      ['type', 'name', 'label'],
      [
        ['begin_group', 'outer', 'Outer'],
        ['begin_repeat', 'members', 'Members'],
        ['end_group', '', ''],
        ['text', 'inside_repeat', 'Inside'],
        ['end_repeat', '', ''],
        ['text', 'after_repeat', 'After'],
        ['end_group', '', ''],
      ],
    );
    const variables = buildVariableMap(survey);
    expect(variables.variables.inside_repeat?.groupPath).toEqual(['outer', 'members']);
    expect(variables.variables.after_repeat?.groupPath).toEqual(['outer']);
  });
});
