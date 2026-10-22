import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '../model/factory';
import type { Row, WorkbookData } from '../model/types';
import { findColumnKey } from '../indexes/columns';
import {
  addFilterColumn,
  applyChoiceEdits,
  applyTypeChange,
  buildListName,
  bulkInsertChoices,
  choiceListNames,
  forkList,
  insertChoiceRow,
  listReferencedInFormulas,
  listUsageDetails,
  renumberList,
  suggestListName,
} from './choices';

function choice(list: string, name: string, label: string, meta?: Row['meta']): Row {
  const row = createRow({ list_name: list, name, label });
  if (meta) row.meta = meta;
  return row;
}

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'select_one yes_no', name: 'consent', label: 'Consent?' }),
    createRow({ type: 'text', name: 'water_source', label: 'Water source' }),
    createRow({ type: 'select_one yes_no', name: 'again', label: 'Again?' }),
  );
  data.choices.rows.push(
    choice('yes_no', 'yes', 'Yes'),
    choice('yes_no', 'no', 'No'),
    choice('other_list', 'one', 'One'),
  );
  return data;
}

const typeOf = (data: WorkbookData, index = 0) =>
  data.survey.rows[index]?.cells[findColumnKey(data.survey, 'type') ?? 'type'];
const nameOf = (data: WorkbookData, index = 0) =>
  data.survey.rows[index]?.cells[findColumnKey(data.survey, 'name') ?? 'name'];

describe('type binding (Task 3.3)', () => {
  it('binds select_one to the question name with the default pattern', () => {
    const data = workbook();
    const rowId = data.survey.rows[1]!.id;
    const next = applyTypeChange(data, rowId, 'select_one');
    expect(typeOf(next, 1)).toBe('select_one water_source');
    expect(data.survey.rows[1]?.cells.type).toBe('text');
  });

  it('honours a {name}_list pattern', () => {
    const data = workbook();
    const rowId = data.survey.rows[1]!.id;
    const next = applyTypeChange(data, rowId, 'select_multiple', { pattern: '{name}_list' });
    expect(typeOf(next, 1)).toBe('select_multiple water_source_list');
  });

  it('avoids list names already bound to another question', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'select_one water_source', name: 'other' }));
    const rowId = data.survey.rows[1]!.id;
    const next = applyTypeChange(data, rowId, 'select_one');
    expect(typeOf(next, 1)).toBe('select_one water_source_2');
  });

  it('adopts the list name when the question name is empty', () => {
    const data = workbook();
    const row = createRow({ type: 'text', label: 'Which list?' });
    data.survey.rows.push(row);
    const next = applyTypeChange(data, row.id, 'select_one consent_list');
    expect(nameOf(next, 3)).toBe('consent_list');
    expect(typeOf(next, 3)).toBe('select_one consent_list');
  });

  it('keeps an explicit list and does not rewrite the name', () => {
    const data = workbook();
    const rowId = data.survey.rows[0]!.id;
    const next = applyTypeChange(data, rowId, 'select_one other_list');
    expect(typeOf(next, 0)).toBe('select_one other_list');
    expect(nameOf(next, 0)).toBe('consent');
  });

  it('suggests slugified, collision-free names', () => {
    const data = workbook();
    expect(buildListName('Water Source', '{name}_list')).toBe('water_source_list');
    expect(suggestListName(data, undefined, 'consent')).toBe('consent');
  });

  it('auto-closes a new repeat and syncs begin↔repeat changes', () => {
    const data = workbook();
    const rowId = data.survey.rows[1]!.id;
    const repeat = applyTypeChange(data, rowId, 'begin_repeat');
    expect(typeOf(repeat, 1)).toBe('begin_repeat');
    expect(typeOf(repeat, 2)).toBe('end_repeat');

    const group = applyTypeChange(repeat, rowId, 'begin_group');
    expect(typeOf(group, 1)).toBe('begin_group');
    expect(typeOf(group, 2)).toBe('end_group');
  });
});

describe('choice edits (Task 3.4)', () => {
  it('auto-fills unique names from labels', () => {
    const data = workbook();
    const rowId = data.choices.rows[0]!.id;
    const next = applyChoiceEdits(data, [{ rowId, column: 'label', value: 'Yes please' }]);
    expect(next.choices.rows[0]?.cells.name).toBe('yes_please');
  });

  it('appends suffixes within the list only', () => {
    const data = workbook();
    const rowId = data.choices.rows[1]!.id;
    const next = applyChoiceEdits(data, [{ rowId, column: 'label', value: 'Yes' }]);
    expect(next.choices.rows[1]?.cells.name).toBe('yes_2');
    expect(next.choices.rows[2]?.cells.name).toBe('one');
  });

  it('never overwrites a manually edited name', () => {
    const data = workbook();
    const rowId = data.choices.rows[0]!.id;
    const named = applyChoiceEdits(data, [{ rowId, column: 'name', value: 'y' }]);
    expect(named.choices.rows[0]?.meta?.nameLocked).toBe(true);
    const labelled = applyChoiceEdits(named, [{ rowId, column: 'label', value: 'Yes indeed' }]);
    expect(labelled.choices.rows[0]?.cells.name).toBe('y');
  });

  it('regenerates after clearing a manual name', () => {
    const data = workbook();
    const rowId = data.choices.rows[0]!.id;
    const named = applyChoiceEdits(data, [{ rowId, column: 'name', value: 'y' }]);
    const cleared = applyChoiceEdits(named, [{ rowId, column: 'name', value: '' }]);
    expect(cleared.choices.rows[0]?.meta?.nameLocked).toBeUndefined();
    const labelled = applyChoiceEdits(cleared, [{ rowId, column: 'label', value: 'Affirmative' }]);
    expect(labelled.choices.rows[0]?.cells.name).toBe('affirmative');
  });

  it('uses numeric and prefix modes for generated names', () => {
    const data = workbook();
    const rowId = data.choices.rows[1]!.id;
    const numeric = applyChoiceEdits(data, [{ rowId, column: 'label', value: 'Negative' }], {
      mode: { kind: 'numeric' },
    });
    expect(numeric.choices.rows[1]?.cells.name).toBe('2');
    const prefixed = applyChoiceEdits(data, [{ rowId, column: 'label', value: 'Negative' }], {
      mode: { kind: 'prefix', prefix: 'opt' },
    });
    expect(prefixed.choices.rows[1]?.cells.name).toBe('opt_2');
  });
});

describe('drawer insertion and bulk paste (Tasks 3.4/3.5)', () => {
  it('inserts after the last row of the list, not at the sheet end', () => {
    const data = workbook();
    const result = insertChoiceRow(data, 'yes_no', { label: 'Maybe' });
    expect(result.data.choices.rows.map((row) => row.cells.list_name)).toEqual([
      'yes_no',
      'yes_no',
      'yes_no',
      'other_list',
    ]);
    expect(result.data.choices.rows[2]?.cells.name).toBe('maybe');
    expect(result.data.choices.rows).toHaveLength(4);
  });

  it('pastes 20 lines with 20 unique names in one transaction', () => {
    const data = workbook();
    const matrix = Array.from({ length: 20 }, (_, index) => [`Label ${index + 1}`]);
    const result = bulkInsertChoices(data, 'water', matrix, ['label']);
    expect(result.rowIds).toHaveLength(20);
    expect(data.choices.rows).toHaveLength(3);
    const rows = result.data.choices.rows.filter((row) => row.cells.list_name === 'water');
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.cells.name)).size).toBe(20);
    expect(rows[0]?.cells.name).toBe('label_1');
    for (const row of rows) expect(row.cells.list_name).toBe('water');
  });

  it('maps multiple pasted columns and locks pasted names', () => {
    const data = workbook();
    data.choices.columns.push('filter');
    const matrix = [
      ['Maybe', 'maybe', 'north'],
      ['Never', '', 'south'],
    ];
    const result = bulkInsertChoices(data, 'yes_no', matrix, ['label', 'name', 'filter']);
    const inserted = result.data.choices.rows.slice(2, 4);
    expect(inserted[0]?.cells).toMatchObject({ name: 'maybe', filter: 'north' });
    expect(inserted[0]?.meta?.nameLocked).toBe(true);
    expect(inserted[1]?.cells.name).toBe('never');
    expect(inserted[1]?.meta).toBeUndefined();
  });

  it('renumbers unlocked rows and avoids locked collisions', () => {
    const data = workbook();
    data.choices.rows = [
      choice('scale', '1', 'Low'),
      choice('scale', 'keep', 'Middle', { nameLocked: true }),
      choice('scale', '3', 'High'),
    ];
    const numeric = renumberList(data, 'scale', { kind: 'numeric' });
    expect(numeric.choices.rows.map((row) => row.cells.name)).toEqual(['1', 'keep', '3']);

    const collision = workbook();
    collision.choices.rows = [
      choice('scale', '1', 'Low'),
      choice('scale', 'locked', 'Middle', { nameLocked: true }),
      choice('scale', '2', 'High'),
    ];
    // Locked row reserves "locked"; the third row is position 3 but "3" is free.
    const renumbered = renumberList(collision, 'scale', { kind: 'numeric' });
    expect(renumbered.choices.rows.map((row) => row.cells.name)).toEqual(['1', 'locked', '3']);

    const prefixed = renumberList(data, 'scale', { kind: 'prefix', prefix: 'opt' });
    expect(prefixed.choices.rows.map((row) => row.cells.name)).toEqual(['opt_1', 'keep', 'opt_3']);
  });

  it('renumbers locked collisions by skipping numbers', () => {
    const data = workbook();
    data.choices.rows = [
      choice('scale', '1', 'Low'),
      choice('scale', '3', 'Middle', { nameLocked: true }),
      choice('scale', 'x', 'High'),
    ];
    const renumbered = renumberList(data, 'scale', { kind: 'numeric' });
    expect(renumbered.choices.rows.map((row) => row.cells.name)).toEqual(['1', '3', '4']);
  });

  it('gives colliding snake labels unique names', () => {
    const data = workbook();
    data.choices.rows = [choice('colors', 'other', 'Other'), choice('colors', 'other', 'Other')];
    const renumbered = renumberList(data, 'colors', { kind: 'snake' });
    expect(renumbered.choices.rows.map((row) => row.cells.name)).toEqual(['other', 'other_2']);
  });
});

describe('shared lists and filters (Task 3.6)', () => {
  it('forks a shared list for one question only', () => {
    const data = workbook();
    const rowId = data.survey.rows[0]!.id;
    const before = data.choices.rows.filter((row) => row.cells.list_name === 'yes_no');
    const result = forkList(data, 'yes_no', rowId);
    expect(result.newListName).toBe('consent');
    expect(typeOf(result.data, 0)).toBe('select_one consent');
    expect(typeOf(result.data, 2)).toBe('select_one yes_no');
    const clone = result.data.choices.rows.filter(
      (row) => row.cells.list_name === result.newListName,
    );
    expect(clone.map((row) => row.cells)).toEqual(
      before.map((row) =>
        expect.objectContaining({ name: row.cells.name, label: row.cells.label }),
      ),
    );
    expect(result.data.choices.rows.length).toBe(data.choices.rows.length + before.length);
  });

  it('adds a filter column and scaffolds choice_filter', () => {
    const data = workbook();
    const rowId = data.survey.rows[0]!.id;
    const result = addFilterColumn(data, 'province_id', {
      surveyRowId: rowId,
      parentName: 'province',
    });
    expect(result.added).toBe(true);
    expect(result.scaffolded).toBe(true);
    expect(result.data.choices.columns).toContain('province_id');
    expect(result.data.survey.rows[0]?.cells.choice_filter).toBe('province_id = ${province}');
    expect(data.choices.columns).not.toContain('province_id');
  });

  it('only appends to an existing choice_filter after confirmation', () => {
    const data = workbook();
    const rowId = data.survey.rows[0]!.id;
    const withFilter = {
      ...data,
      survey: {
        ...data.survey,
        rows: data.survey.rows.map((row) =>
          row.id === rowId ? { ...row, cells: { ...row.cells, choice_filter: 'a = 1' } } : row,
        ),
      },
    };
    const rejected = addFilterColumn(withFilter, 'province_id', {
      surveyRowId: rowId,
      parentName: 'province',
    });
    expect(rejected.scaffolded).toBe(false);
    expect(rejected.data.survey.rows[0]?.cells.choice_filter).toBe('a = 1');

    const accepted = addFilterColumn(withFilter, 'province_id', {
      surveyRowId: rowId,
      parentName: 'province',
      append: true,
    });
    expect(accepted.data.survey.rows[0]?.cells.choice_filter).toBe(
      'a = 1 and province_id = ${province}',
    );
  });

  it('detects formulas that reference the list question', () => {
    const data = workbook();
    expect(listReferencedInFormulas(data, 'yes_no')).toEqual([]);
    const linked = {
      ...data,
      survey: {
        ...data.survey,
        rows: data.survey.rows.map((row, index) =>
          index === 2 ? { ...row, cells: { ...row.cells, relevant: '${consent} = 1' } } : row,
        ),
      },
    };
    expect(listReferencedInFormulas(linked, 'yes_no')).toEqual(['consent']);
  });

  it('lists names and usage details in document order', () => {
    const data = workbook();
    expect(choiceListNames(data)).toEqual(['yes_no', 'other_list']);
    expect(listUsageDetails(data, 'yes_no').map((entry) => entry.name)).toEqual([
      'consent',
      'again',
    ]);
  });
});
