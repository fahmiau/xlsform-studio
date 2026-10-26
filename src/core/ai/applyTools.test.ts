import { describe, expect, it } from 'vitest';

import type { WorkbookData } from '@/core/model/types';

import { applyToolCall, checkBatchBalance } from './applyTools';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label', 'label::Indonesian (id)', 'relevant'],
      rows: [
        {
          id: 's1',
          cells: {
            type: 'begin_group',
            name: 'household',
            label: 'Household',
            'label::Indonesian (id)': 'Rumah tangga',
          },
        },
        { id: 's2', cells: { type: 'text', name: 'age', label: 'Age' } },
        { id: 's3', cells: { type: 'end_group' } },
        {
          id: 's4',
          cells: { type: 'integer', name: 'income', label: 'Income', relevant: '${age} > 0' },
        },
      ],
    },
    choices: {
      sheetName: 'choices',
      columns: ['list_name', 'name', 'label'],
      rows: [
        { id: 'c1', cells: { list_name: 'yes_no', name: 'yes', label: 'Yes' } },
        { id: 'c2', cells: { list_name: 'yes_no', name: 'no', label: 'No' } },
      ],
    },
    settings: {
      sheetName: 'settings',
      columns: ['form_title', 'default_language'],
      rows: [{ id: 't1', cells: { form_title: 'Test form', default_language: 'Default' } }],
    },
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}

function ids(start = 1): () => string {
  let next = start;
  return () => `new${(next += 1)}`;
}

function names(data: WorkbookData): string[] {
  return data.survey.rows.map((row) => row.cells.name ?? '');
}

describe('checkBatchBalance', () => {
  it('accepts a balanced batch', () => {
    expect(checkBatchBalance(['begin_group', 'text', 'end_group']).ok).toBe(true);
  });
  it('rejects an unclosed begin', () => {
    expect(checkBatchBalance(['begin_group', 'text']).ok).toBe(false);
  });
  it('rejects a stray end', () => {
    expect(checkBatchBalance(['text', 'end_group']).ok).toBe(false);
  });
  it('rejects a mismatched end kind', () => {
    expect(checkBatchBalance(['begin_repeat', 'end_group']).ok).toBe(false);
  });
  it('accepts nested groups', () => {
    expect(checkBatchBalance(['begin_group', 'begin_repeat', 'end_repeat', 'end_group']).ok).toBe(
      true,
    );
  });
});

describe('insert_survey_rows', () => {
  it('inserts at the top for afterRowIndex -1', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      { afterRowIndex: -1, rows: [{ type: 'text', name: 'first', label: { Default: 'First' } }] },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    expect(names(out.data)[0]).toBe('first');
  });

  it('inserts after the given index', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      { afterRowIndex: 1, rows: [{ type: 'text', name: 'middle' }] },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    expect(names(out.data)).toEqual(['household', 'age', 'middle', '', 'income']);
  });

  it('inserts a balanced begin/end group block', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      {
        afterRowIndex: 3,
        rows: [
          { type: 'begin_group', name: 'education', label: { Default: 'Education' } },
          { type: 'select_one education_level', name: 'education_level' },
          { type: 'end_group' },
        ],
      },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    expect(names(out.data)).toContain('education');
    expect(out.data.survey.rows.at(-1)?.cells.type).toBe('end_group');
  });

  it('inserts a group with a repeat block', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      {
        afterRowIndex: 3,
        rows: [
          { type: 'begin_repeat', name: 'roster' },
          { type: 'text', name: 'member_name' },
          { type: 'end_repeat' },
        ],
      },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows.filter((row) => row.cells.type === 'begin_repeat')).toHaveLength(1);
    expect(out.data.survey.rows.filter((row) => row.cells.type === 'end_repeat')).toHaveLength(1);
  });

  it('rejects an unclosed group batch', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [{ type: 'begin_group', name: 'lonely' }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors.join(' ')).toContain('no matching end');
  });

  it('rejects a stray end row', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [{ type: 'end_group' }],
    });
    expect(out.result.ok).toBe(false);
  });

  it('rejects a duplicate name with a suggestion', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [{ type: 'text', name: 'age' }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('age_2');
  });

  it('rejects duplicate names inside one batch', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [
        { type: 'text', name: 'same' },
        { type: 'text', name: 'same' },
      ],
    });
    expect(out.result.ok).toBe(false);
  });

  it('rejects an invalid variable name', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [{ type: 'text', name: '1 bad name' }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('not a valid variable name');
  });

  it('rejects an empty batch through the schema', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', { afterRowIndex: -1, rows: [] });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors.length).toBeGreaterThan(0);
  });

  it('adds a localized label column on demand', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      {
        afterRowIndex: -1,
        rows: [
          {
            type: 'text',
            name: 'city',
            label: { Default: 'City', id: 'Kota' },
          },
        ],
      },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    const row = out.data.survey.rows[0]!;
    expect(row.cells.label).toBe('City');
    expect(row.cells['label::Indonesian (id)']).toBe('Kota');
  });

  it('rejects an unknown language and lists the available ones', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', {
      afterRowIndex: -1,
      rows: [{ type: 'text', name: 'city', label: { Klingon: 'Qo' } }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('unknown language "Klingon"');
    expect(out.result.errors[0]).toContain('Indonesian (id)');
  });

  it('adds scalar columns that do not exist yet', () => {
    const out = applyToolCall(
      workbook(),
      'insert_survey_rows',
      {
        afterRowIndex: -1,
        rows: [
          {
            type: 'integer',
            name: 'years',
            calculation: '${age}',
            constraint: '. > 0',
            appearance: 'minimal',
          },
        ],
      },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    for (const column of ['calculation', 'constraint', 'appearance']) {
      expect(out.data.survey.columns).toContain(column);
    }
    expect(out.data.survey.rows[0]?.cells.calculation).toBe('${age}');
  });

  it('assigns deterministic ids when a generator is supplied', () => {
    const input = { afterRowIndex: -1, rows: [{ type: 'text', name: 'a' }] };
    const first = applyToolCall(workbook(), 'insert_survey_rows', input, { newId: ids() });
    const second = applyToolCall(workbook(), 'insert_survey_rows', input, { newId: ids() });
    expect(first.data).toEqual(second.data);
  });
});

describe('update_survey_cells', () => {
  it('updates a cell by variable name', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { label: 'Respondent age' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows[1]?.cells.label).toBe('Respondent age');
  });

  it('updates a cell by row id', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 's4', changes: { relevant: '${age} >= 18' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows[3]?.cells.relevant).toBe('${age} >= 18');
  });

  it('rejects an unknown target', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'missing', changes: { label: 'X' } }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('row not found');
  });

  it('rejects an unknown column', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { nonsense: 'X' } }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('unknown survey column');
  });

  it('routes a name change through renameVariable so references follow', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { name: 'years' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(names(out.data)).toContain('years');
    expect(out.data.survey.rows[3]?.cells.relevant).toBe('${years} > 0');
  });

  it('rejects a name collision', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { name: 'income' } }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('already used');
  });

  it('rejects an invalid new name', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { name: '2bad' } }],
    });
    expect(out.result.ok).toBe(false);
  });

  it('adds a missing column', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { appearance: 'minimal' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.columns).toContain('appearance');
  });

  it('updates a localized label through a :: key', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [{ targetName: 'age', changes: { 'label::Indonesian (id)': 'Usia responden' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows[1]?.cells['label::Indonesian (id)']).toBe('Usia responden');
  });

  it('applies several updates in one call', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', {
      updates: [
        { targetName: 'age', changes: { required: 'yes' } },
        { targetName: 'income', changes: { constraint: '. >= 0' } },
      ],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows[1]?.cells.required).toBe('yes');
    expect(out.data.survey.rows[3]?.cells.constraint).toBe('. >= 0');
    expect(out.result.summary).toContain('2 cell(s)');
  });

  it('rejects an empty update list through the schema', () => {
    const out = applyToolCall(workbook(), 'update_survey_cells', { updates: [] });
    expect(out.result.ok).toBe(false);
  });
});

describe('upsert_choice_list', () => {
  it('creates a list and auto-names choices from labels', () => {
    const out = applyToolCall(
      workbook(),
      'upsert_choice_list',
      {
        list_name: 'education_level',
        mode: 'replace',
        choices: [{ label: { Default: 'Primary school' } }, { label: { Default: 'High school' } }],
      },
      { newId: ids() },
    );
    expect(out.result.ok).toBe(true);
    const rows = out.data.choices.rows.filter((row) => row.cells.list_name === 'education_level');
    expect(rows.map((row) => row.cells.name)).toEqual(['primary_school', 'high_school']);
  });

  it('keeps explicit choice names', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'education_level',
      mode: 'replace',
      choices: [{ name: 'sd', label: { Default: 'SD' } }],
    });
    expect(out.result.ok).toBe(true);
    const row = out.data.choices.rows.find((candidate) => candidate.cells.name === 'sd');
    expect(row?.cells.label).toBe('SD');
  });

  it('marks upserted choice rows as name-locked', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'education_level',
      mode: 'replace',
      choices: [{ name: 'sd', label: { Default: 'SD' } }],
    });
    const row = out.data.choices.rows.find((candidate) => candidate.cells.name === 'sd');
    expect(row?.meta?.nameLocked).toBe(true);
  });

  it('replaces an existing list in place', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'yes_no',
      mode: 'replace',
      choices: [
        { name: 'oui', label: { Default: 'Oui' } },
        { name: 'non', label: { Default: 'Non' } },
      ],
    });
    expect(out.result.ok).toBe(true);
    const rows = out.data.choices.rows.filter((row) => row.cells.list_name === 'yes_no');
    expect(rows.map((row) => row.cells.name)).toEqual(['oui', 'non']);
    expect(out.data.choices.rows[0]?.cells.name).toBe('oui');
  });

  it('appends without touching existing choices', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'yes_no',
      mode: 'append',
      choices: [{ name: 'maybe', label: { Default: 'Maybe' } }],
    });
    expect(out.result.ok).toBe(true);
    const rows = out.data.choices.rows.filter((row) => row.cells.list_name === 'yes_no');
    expect(rows.map((row) => row.cells.name)).toEqual(['yes', 'no', 'maybe']);
  });

  it('inserts the list contiguously', () => {
    const out = applyToolCall(
      workbook(),
      'upsert_choice_list',
      {
        list_name: 'letters',
        mode: 'replace',
        choices: [
          { name: 'a', label: { Default: 'A' } },
          { name: 'b', label: { Default: 'B' } },
        ],
      },
      { newId: ids() },
    );
    const indexes = out.data.choices.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.cells.list_name === 'letters')
      .map(({ index }) => index);
    expect(indexes).toEqual([2, 3]);
  });

  it('rejects a duplicate choice name with a suggestion', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'yes_no',
      mode: 'append',
      choices: [{ name: 'yes', label: { Default: 'Yes again' } }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('yes_2');
  });

  it('rejects an invalid list name', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: '1 bad list',
      mode: 'replace',
      choices: [{ name: 'a' }],
    });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('invalid list_name');
  });

  it('adds filter columns', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'districts',
      mode: 'replace',
      choices: [{ name: 'd1', label: { Default: 'District 1' }, filters: { province: 'p1' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.choices.columns).toContain('province');
    expect(out.data.choices.rows.find((row) => row.cells.name === 'd1')?.cells.province).toBe('p1');
  });

  it('supports localized labels', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'education_level',
      mode: 'replace',
      choices: [{ name: 'sd', label: { Default: 'Primary', id: 'SD' } }],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.choices.rows[2]?.cells['label::Indonesian (id)']).toBe('SD');
  });

  it('rejects an empty choice list through the schema', () => {
    const out = applyToolCall(workbook(), 'upsert_choice_list', {
      list_name: 'x',
      mode: 'replace',
      choices: [],
    });
    expect(out.result.ok).toBe(false);
  });
});

describe('delete_survey_rows', () => {
  it('deletes a row by name', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', { targetNames: ['age'] });
    expect(out.result.ok).toBe(true);
    expect(names(out.data)).not.toContain('age');
  });

  it('deletes a row by id', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', { targetNames: ['s4'] });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows).toHaveLength(3);
  });

  it('rejects an unknown target', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', { targetNames: ['nope'] });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('row not found');
  });

  it('rejects deleting a group begin without its end', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', { targetNames: ['household'] });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('requires its end row');
  });

  it('rejects deleting an end without its begin', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', { targetNames: ['s3'] });
    expect(out.result.ok).toBe(false);
    expect(out.result.errors[0]).toContain('requires its begin row');
  });

  it('deletes a whole group when both ends are targeted', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', {
      targetNames: ['household', 's3'],
    });
    expect(out.result.ok).toBe(true);
    expect(out.data.survey.rows.map((row) => row.id)).toEqual(['s2', 's4']);
  });

  it('deletes several independent rows', () => {
    const out = applyToolCall(workbook(), 'delete_survey_rows', {
      targetNames: ['age', 'income'],
    });
    expect(out.result.ok).toBe(true);
    expect(out.result.summary).toContain('2');
  });
});

describe('applyToolCall dispatch', () => {
  it('rejects malformed input without throwing', () => {
    const out = applyToolCall(workbook(), 'insert_survey_rows', { rows: 'nope' });
    expect(out.result.ok).toBe(false);
    expect(out.data).toEqual(workbook());
  });

  it('leaves the draft untouched on validation errors', () => {
    const base = workbook();
    const out = applyToolCall(base, 'delete_survey_rows', { targetNames: ['missing'] });
    expect(out.data).toBe(base);
  });
});
