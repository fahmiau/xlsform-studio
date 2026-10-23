import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '../model/factory';
import type { WorkbookData } from '../model/types';
import { isValidListName, listRenameError, renameList, replaceListToken } from './renameList';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'select_one gender_list', name: 'gender' }),
    createRow({ type: 'select_multiple gender_list or_other', name: 'roles' }),
    createRow({ type: 'rank gender_list', name: 'ranked' }),
    createRow({ type: 'select_one other_list', name: 'other' }),
    createRow({ type: 'text', name: 'plain' }),
  );
  data.choices.rows.push(
    createRow({ list_name: 'gender_list', name: 'male', label: 'Male' }),
    createRow({ list_name: 'gender_list', name: 'female', label: 'Female' }),
    createRow({ list_name: 'other_list', name: 'x', label: 'X' }),
  );
  return data;
}

const typeOf = (data: WorkbookData, index: number) => data.survey.rows[index]!.cells.type;

describe('isValidListName (Task 5.2)', () => {
  it('accepts XML-name style list names', () => {
    expect(isValidListName('gender_list')).toBe(true);
    expect(isValidListName('a.b-c')).toBe(true);
    expect(isValidListName('_hidden')).toBe(true);
  });

  it('rejects empty, spaced, or leading-digit names', () => {
    expect(isValidListName('')).toBe(false);
    expect(isValidListName('two words')).toBe(false);
    expect(isValidListName('1list')).toBe(false);
    expect(isValidListName('bad!')).toBe(false);
  });
});

describe('listRenameError (Task 5.2)', () => {
  it('rejects an empty name', () => {
    expect(listRenameError(workbook(), 'gender_list', '')).toMatch(/empty/i);
  });

  it('rejects an invalid name', () => {
    expect(listRenameError(workbook(), 'gender_list', 'bad name')).toMatch(/not a valid/i);
  });

  it('rejects a collision with an existing list', () => {
    expect(listRenameError(workbook(), 'gender_list', 'other_list')).toMatch(/already exists/i);
  });

  it('allows the unchanged name', () => {
    expect(listRenameError(workbook(), 'gender_list', 'gender_list')).toBeNull();
  });

  it('allows a fresh name', () => {
    expect(listRenameError(workbook(), 'gender_list', 'gender_v2')).toBeNull();
  });
});

describe('replaceListToken (Task 5.2)', () => {
  it('replaces only the list token', () => {
    expect(replaceListToken('select_one gender_list', 'gender_list', 'g2')).toBe('select_one g2');
  });

  it('keeps or_other and extra spacing', () => {
    expect(replaceListToken('select_multiple  gender_list  or_other', 'gender_list', 'g2')).toBe(
      'select_multiple  g2  or_other',
    );
  });

  it('keeps the from spelling', () => {
    expect(replaceListToken('select_one from gender_list', 'gender_list', 'g2')).toBe(
      'select_one from g2',
    );
  });
});

describe('renameList (Task 5.2)', () => {
  it('rewrites choice list_name cells', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(result.data.choices.rows[0]!.cells.list_name).toBe('sex_list');
    expect(result.data.choices.rows[1]!.cells.list_name).toBe('sex_list');
    expect(result.data.choices.rows[2]!.cells.list_name).toBe('other_list');
  });

  it('rewrites select_one bindings', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(typeOf(result.data, 0)).toBe('select_one sex_list');
  });

  it('rewrites select_multiple and keeps or_other', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(typeOf(result.data, 1)).toBe('select_multiple sex_list or_other');
  });

  it('rewrites rank bindings', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(typeOf(result.data, 2)).toBe('rank sex_list');
  });

  it('leaves other lists alone', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(typeOf(result.data, 3)).toBe('select_one other_list');
  });

  it('reports one change per touched cell', () => {
    const result = renameList(workbook(), 'gender_list', 'sex_list');
    expect(result.changes).toHaveLength(5);
    expect(result.changes.filter((change) => change.sheet === 'survey')).toHaveLength(3);
    expect(result.changes.filter((change) => change.sheet === 'choices')).toHaveLength(2);
  });

  it('is a no-op for an unchanged name', () => {
    const data = workbook();
    expect(renameList(data, 'gender_list', 'gender_list').data).toBe(data);
  });

  it('is a no-op for an empty name', () => {
    const data = workbook();
    expect(renameList(data, 'gender_list', '  ').data).toBe(data);
  });

  it('refuses an invalid name', () => {
    const data = workbook();
    expect(renameList(data, 'gender_list', 'bad name').data).toBe(data);
  });

  it('refuses a duplicate list name', () => {
    const data = workbook();
    expect(renameList(data, 'gender_list', 'other_list').data).toBe(data);
  });

  it('renames a list that only appears in a survey binding', () => {
    const data = createEmptyWorkbook();
    data.survey.rows.push(createRow({ type: 'select_one ghost_list', name: 'ghost' }));
    const result = renameList(data, 'ghost_list', 'real_list');
    expect(typeOf(result.data, 0)).toBe('select_one real_list');
  });

  it('does not mutate the input', () => {
    const data = workbook();
    renameList(data, 'gender_list', 'sex_list');
    expect(data.choices.rows[0]!.cells.list_name).toBe('gender_list');
    expect(typeOf(data, 0)).toBe('select_one gender_list');
  });

  it('returns the same data object when no cell matches', () => {
    const data = createEmptyWorkbook();
    expect(renameList(data, 'missing', 'other').data).toBe(data);
  });

  it('trims whitespace around the new name', () => {
    const result = renameList(workbook(), ' gender_list ', ' sex_list ');
    expect(result.data.choices.rows[0]!.cells.list_name).toBe('sex_list');
  });
});
