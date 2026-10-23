import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from './factory';
import { readSettings } from './settings';

describe('readSettings', () => {
  it('reads canonical settings', () => {
    const data = createEmptyWorkbook();
    data.settings.columns = [...data.settings.columns, 'allow_choice_duplicates'];
    data.settings.rows = [
      {
        id: 't1',
        cells: {
          form_title: 'Form',
          form_id: 'form',
          version: '2',
          default_language: 'English (en)',
          instance_name: '${q1}',
          allow_choice_duplicates: 'yes',
        },
      },
    ];
    expect(readSettings(data.settings)).toEqual({
      formTitle: 'Form',
      formId: 'form',
      version: '2',
      defaultLanguage: 'English (en)',
      instanceName: '${q1}',
      allowChoiceDuplicates: true,
    });
  });

  it('accepts pyxform aliases and TRUE', () => {
    const data = createEmptyWorkbook();
    data.settings.columns = [
      'Form Title',
      'Default Language',
      'Allow Choice Duplicates',
      'Instance Name',
    ];
    data.settings.rows = [
      {
        id: 't1',
        cells: {
          'Form Title': 'Alias form',
          'Default Language': 'French (fr)',
          'Allow Choice Duplicates': 'TRUE',
          'Instance Name': '${q1}',
        },
      },
    ];
    expect(readSettings(data.settings)).toMatchObject({
      formTitle: 'Alias form',
      defaultLanguage: 'French (fr)',
      allowChoiceDuplicates: true,
      instanceName: '${q1}',
    });
  });

  it('defaults to false and omits blank values', () => {
    const data = createEmptyWorkbook();
    data.settings.rows = [{ id: 't1', cells: { form_id: 'f', default_language: '  ' } }];
    expect(readSettings(data.settings)).toEqual({ allowChoiceDuplicates: false, formId: 'f' });
  });

  it('takes the first non-empty value across rows', () => {
    const data = createEmptyWorkbook();
    data.settings.rows = [
      { id: 't1', cells: { form_id: '' } },
      { id: 't2', cells: { form_id: 'second' } },
    ];
    expect(readSettings(data.settings).formId).toBe('second');
  });
});
