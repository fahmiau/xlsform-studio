// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { discoverLanguages, findLanguage } from '../languages/discover';
import { createEmptyWorkbook, createRow } from '../model/factory';
import type { WorkbookData } from '../model/types';
import { readWorkbook } from '../xlsx/read';
import { writeWorkbook } from '../xlsx/write';
import { addLanguage } from './languages';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(createRow({ type: 'text', name: 'q1', label: 'Question' }));
  data.choices.rows.push(createRow({ list_name: 'l', name: 'c', label: 'Choice' }));
  return data;
}

describe('addLanguage (Task 5.5)', () => {
  it('creates the PRD columns in both sheets', () => {
    const result = addLanguage(workbook(), { name: 'English', code: 'en' });
    expect(result.data.survey.columns).toEqual(
      expect.arrayContaining([
        'label::English (en)',
        'hint::English (en)',
        'constraint_message::English (en)',
      ]),
    );
    expect(result.data.choices.columns).toContain('label::English (en)');
    expect(result.added).toHaveLength(4);
  });

  it('omits the code part when no code is given', () => {
    const result = addLanguage(workbook(), { name: 'French' });
    expect(result.data.survey.columns).toContain('label::French');
    expect(result.data.survey.columns).not.toContain('label::French (undefined)');
  });

  it('reports the created headers', () => {
    const result = addLanguage(workbook(), { name: 'English', code: 'en' });
    expect(result.added.map((change) => change.column)).toEqual([
      'label::English (en)',
      'hint::English (en)',
      'constraint_message::English (en)',
      'label::English (en)',
    ]);
    expect(result.added.filter((change) => change.sheet === 'survey')).toHaveLength(3);
    expect(result.added.filter((change) => change.sheet === 'choices')).toHaveLength(1);
  });

  it('places each column right after the last column of the same base', () => {
    const data = workbook();
    data.survey.columns.push('label::French (fr)', 'hint::French (fr)');
    const result = addLanguage(data, { name: 'English', code: 'en' });
    const columns = result.data.survey.columns;
    expect(columns.indexOf('label::English (en)')).toBe(columns.indexOf('label::French (fr)') + 1);
    expect(columns.indexOf('hint::English (en)')).toBe(columns.indexOf('hint::French (fr)') + 1);
  });

  it('appends a base at the end when the sheet has no such column', () => {
    const data = workbook();
    data.survey.columns = ['type', 'name'];
    const result = addLanguage(data, { name: 'English', code: 'en' });
    expect(result.data.survey.columns).toEqual([
      'type',
      'name',
      'label::English (en)',
      'hint::English (en)',
      'constraint_message::English (en)',
    ]);
  });

  it('rejects a duplicate name', () => {
    const data = addLanguage(workbook(), { name: 'English', code: 'en' }).data;
    expect(() => addLanguage(data, { name: 'English', code: 'en' })).toThrow(/already exists/i);
  });

  it('rejects a duplicate code under a different name', () => {
    const data = addLanguage(workbook(), { name: 'English', code: 'en' }).data;
    expect(() => addLanguage(data, { name: 'Inglés', code: 'en' })).toThrow(/already exists/i);
  });

  it('rejects an empty name', () => {
    expect(() => addLanguage(workbook(), { name: '   ' })).toThrow(/required/i);
  });

  it('reserves the Default pseudo-language name', () => {
    expect(() => addLanguage(workbook(), { name: 'default' })).toThrow(/reserved/i);
  });

  it('trims the name and code', () => {
    const result = addLanguage(workbook(), { name: ' English ', code: ' en ' });
    expect(result.data.survey.columns).toContain('label::English (en)');
  });

  it('converts unsuffixed columns instead of adding parallels', () => {
    const data = workbook();
    data.survey.columns.push('hint', 'constraint_message');
    const result = addLanguage(data, {
      name: 'Indonesian',
      code: 'id',
      convertDefault: true,
    });
    expect(result.data.survey.columns).not.toContain('label');
    expect(result.data.survey.columns).toContain('label::Indonesian (id)');
    expect(result.data.choices.columns).not.toContain('label');
    expect(result.data.choices.columns).toContain('label::Indonesian (id)');
    expect(result.renamed).toHaveLength(4);
    expect(result.added).toHaveLength(0);
  });

  it('keeps cell values when converting', () => {
    const result = addLanguage(workbook(), {
      name: 'Indonesian',
      code: 'id',
      convertDefault: true,
    });
    expect(result.data.survey.rows[0]!.cells['label::Indonesian (id)']).toBe('Question');
    expect(result.data.choices.rows[0]!.cells['label::Indonesian (id)']).toBe('Choice');
  });

  it('does not mutate the input workbook', () => {
    const data = workbook();
    addLanguage(data, { name: 'English', code: 'en' });
    expect(data.survey.columns).not.toContain('label::English (en)');
  });

  it('is discovered after adding', () => {
    const result = addLanguage(workbook(), { name: 'English', code: 'en' });
    const languages = discoverLanguages(result.data);
    const english = findLanguage(languages, 'en');
    expect(english?.display).toBe('English (en)');
    expect(english?.columns.survey).toHaveLength(3);
  });

  it('survives a save/reopen round trip', async () => {
    const data = addLanguage(workbook(), { name: 'English', code: 'en' }).data;
    const bytes = await writeWorkbook(data);
    const reopened = await readWorkbook(bytes);
    expect(reopened.data.survey.columns).toContain('label::English (en)');
    expect(reopened.data.choices.columns).toContain('label::English (en)');
    expect(findLanguage(discoverLanguages(reopened.data), 'en')?.display).toBe('English (en)');
  });
});
