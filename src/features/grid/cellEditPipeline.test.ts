import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import type { WorkbookData } from '@/core/model/types';
import { applyCellEdits, applyListMode } from './cellEditPipeline';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({
      type: 'select_one marital_status',
      name: 'marital',
      relevant: "selected(${marital}, 'married')",
    }),
    createRow({ type: 'integer', name: 'age', constraint: '${age} > 0' }),
  );
  data.choices.rows.push(
    createRow({ list_name: 'marital_status', name: 'single', label: 'Single' }),
    createRow({ list_name: 'marital_status', name: 'married', label: 'Married' }),
  );
  return data;
}

const nameKey = 'name';

describe('applyCellEdits — survey (Task 5.1)', () => {
  it('renames a variable and reports the reference count in one outcome', () => {
    const data = workbook();
    const row = data.survey.rows[1]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: nameKey, value: 'years' },
    ]);
    expect(outcome.data.survey.rows[1]!.cells.name).toBe('years');
    expect(outcome.data.survey.rows[1]!.cells.constraint).toBe('${years} > 0');
    expect(outcome.variableRenames).toEqual([{ from: 'age', to: 'years', changes: 1 }]);
  });

  it('reports zero changes when no formula referenced the old name', () => {
    const data = workbook();
    data.survey.rows[1]!.cells.constraint = '';
    const row = data.survey.rows[1]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: nameKey, value: 'years' },
    ]);
    expect(outcome.variableRenames).toEqual([{ from: 'age', to: 'years', changes: 0 }]);
  });

  it('skips propagation when the old name is duplicated', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'integer', name: 'dup', constraint: '${dup} > 1' }));
    data.survey.rows.push(createRow({ type: 'integer', name: 'dup' }));
    const row = data.survey.rows[2]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: nameKey, value: 'dup_2' },
    ]);
    expect(outcome.skippedDuplicate).toEqual({ name: 'dup', uses: 2 });
    expect(outcome.variableRenames).toEqual([]);
    expect(outcome.data.survey.rows[2]!.cells.constraint).toBe('${dup} > 1');
  });

  it('does not treat an empty old name as a rename', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'text', name: '' }));
    const row = data.survey.rows[2]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: nameKey, value: 'fresh' },
    ]);
    expect(outcome.variableRenames).toEqual([]);
    expect(outcome.data.survey.rows[2]!.cells.name).toBe('fresh');
  });

  it('does not rename when the name is unchanged', () => {
    const data = workbook();
    const row = data.survey.rows[1]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: nameKey, value: 'age' },
    ]);
    expect(outcome.variableRenames).toEqual([]);
  });

  it('binds a list when the type cell is committed', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'text', name: 'new_question' }));
    const row = data.survey.rows[2]!;
    const outcome = applyCellEdits(data, 'survey', [
      { rowId: row.id, column: 'type', value: 'select_one' },
    ]);
    expect(outcome.data.survey.rows[2]!.cells.type).toBe('select_one new_question');
  });

  it('binds the list with the Preferences pattern (Task 5.7/3.3)', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'text', name: 'marital' }));
    const row = data.survey.rows[2]!;
    const outcome = applyCellEdits(
      data,
      'survey',
      [{ rowId: row.id, column: 'type', value: 'select_one' }],
      { listNamePattern: '{name}_list' },
    );
    expect(outcome.data.survey.rows[2]!.cells.type).toBe('select_one marital_list');

    const custom = applyCellEdits(
      data,
      'survey',
      [{ rowId: row.id, column: 'type', value: 'select_one' }],
      { listNamePattern: '{name}_choices' },
    );
    expect(custom.data.survey.rows[2]!.cells.type).toBe('select_one marital_choices');
  });

  it('applies settings edits directly', () => {
    const data = workbook();
    const row = data.settings.rows[0]!;
    const outcome = applyCellEdits(data, 'settings', [
      { rowId: row.id, column: 'form_title', value: 'New title' },
    ]);
    expect(outcome.data.settings.rows[0]!.cells.form_title).toBe('New title');
    expect(outcome.variableRenames).toEqual([]);
  });

  it('is a no-op for an empty edit batch', () => {
    const data = workbook();
    expect(applyCellEdits(data, 'survey', []).data).toBe(data);
  });
});

describe('applyCellEdits — choices (Task 5.2)', () => {
  it('propagates a unique choice rename into formulas in the same outcome', () => {
    const data = workbook();
    const row = data.choices.rows[1]!;
    const outcome = applyCellEdits(data, 'choices', [
      { rowId: row.id, column: 'name', value: 'married_lt' },
    ]);
    expect(outcome.data.choices.rows[1]!.cells.name).toBe('married_lt');
    expect(outcome.data.survey.rows[0]!.cells.relevant).toBe("selected(${marital}, 'married_lt')");
    expect(outcome.choiceRenames).toEqual([
      expect.objectContaining({ from: 'married', to: 'married_lt' }),
    ]);
    expect(outcome.choiceChanges).toBeGreaterThan(0);
  });

  it('propagates a label edit that regenerates the code', () => {
    const data = workbook();
    const row = data.choices.rows[1]!;
    const outcome = applyCellEdits(
      data,
      'choices',
      [{ rowId: row.id, column: 'label', value: 'Living together' }],
      { mode: { kind: 'snake' } },
    );
    expect(outcome.data.choices.rows[1]!.cells.name).toBe('living_together');
    expect(outcome.data.survey.rows[0]!.cells.relevant).toBe(
      "selected(${marital}, 'living_together')",
    );
  });

  it('does not propagate a rename of a duplicated code', () => {
    const data = workbook();
    data.choices.rows.push(
      createRow({ list_name: 'marital_status', name: 'married', label: 'Married again' }),
    );
    const row = data.choices.rows[1]!;
    const outcome = applyCellEdits(data, 'choices', [
      { rowId: row.id, column: 'name', value: 'married_lt' },
    ]);
    expect(outcome.choiceRenames).toEqual([]);
    expect(outcome.data.survey.rows[0]!.cells.relevant).toBe("selected(${marital}, 'married')");
  });
});

describe('applyCellEdits — naming defaults (Task 5.7)', () => {
  it('uses defaultMode for a list without names', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'select_one drinks', name: 'drink' }));
    data.choices.rows.push(createRow({ list_name: 'drinks', label: 'Drinking Water' }));
    const row = data.choices.rows[2]!;
    const outcome = applyCellEdits(
      data,
      'choices',
      [{ rowId: row.id, column: 'label', value: 'Drinking Water' }],
      { defaultMode: { kind: 'camel' } },
    );
    expect(outcome.data.choices.rows[2]!.cells.name).toBe('drinkingWater');
  });

  it('prefers an explicit per-list override over the default', () => {
    const data = workbook();
    data.choices.rows.push(createRow({ list_name: 'drinks', label: 'Drinking Water' }));
    const row = data.choices.rows[2]!;
    const outcome = applyCellEdits(
      data,
      'choices',
      [{ rowId: row.id, column: 'label', value: 'Drinking Water' }],
      { defaultMode: { kind: 'camel' }, choiceModes: { drinks: { kind: 'snake' } } },
    );
    expect(outcome.data.choices.rows[2]!.cells.name).toBe('drinking_water');
  });
});

describe('applyListMode (Task 5.2)', () => {
  it('renumbers the list and propagates changed codes', () => {
    const data = workbook();
    data.choices.rows[0]!.cells.name = 'opt_1';
    data.choices.rows[1]!.cells.name = 'opt_2';
    const outcome = applyListMode(data, 'marital_status', { kind: 'snake' }, 32);
    expect(outcome.data.choices.rows[0]!.cells.name).toBe('single');
    expect(outcome.data.choices.rows[1]!.cells.name).toBe('married');
    expect(outcome.choiceRenames).toHaveLength(2);
  });

  it('returns the same data when the names do not change', () => {
    const data = workbook();
    expect(applyListMode(data, 'missing', { kind: 'snake' }).data).toBe(data);
  });
});
