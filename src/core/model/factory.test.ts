import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS_COLUMNS, resolveColumn } from './columns';
import { createEmptyWorkbook, createRow, createSettingsRow, newRowId } from './factory';

describe('factory', () => {
  it('creates a blank workbook with the three managed sheets and default columns', () => {
    const workbook = createEmptyWorkbook();
    expect(workbook.sheetOrder).toEqual(['survey', 'choices', 'settings']);
    expect(workbook.passthrough).toEqual([]);
    expect(workbook.survey.sheetName).toBe('survey');
    expect(workbook.choices.sheetName).toBe('choices');
    expect(workbook.settings.sheetName).toBe('settings');
    expect(workbook.survey.rows).toEqual([]);
    expect(workbook.choices.rows).toEqual([]);
    expect(workbook.settings.rows).toHaveLength(1);
    expect(workbook.survey.columns).toEqual(['type', 'name', 'label']);
    expect(workbook.choices.columns).toEqual(['list_name', 'name', 'label']);
    expect(workbook.settings.columns).toEqual([...DEFAULT_SETTINGS_COLUMNS]);
  });

  it('creates a settings row that is a valid XLSForm settings row', () => {
    const workbook = createEmptyWorkbook();
    const settings = workbook.settings.rows[0];
    expect(settings?.cells.form_title).toBe('Untitled form');
    expect(settings?.cells.form_id).toMatch(/^form_[a-z0-9]{8}$/);
    expect(settings?.cells.version).toBe('1');
    for (const column of workbook.settings.columns) {
      expect(resolveColumn(column).base, column).not.toBe('custom');
    }
  });

  it('generates unique, spreadsheet-safe row ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRowId()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-z]{12}$/);
    }
  });

  it('creates rows with defensive copies of the cells', () => {
    const cells = { type: 'text', name: 'q1' };
    const row = createRow(cells);
    row.cells.name = 'changed';
    expect(cells.name).toBe('q1');

    const settings = createSettingsRow('form_fixed01');
    expect(settings.cells.form_id).toBe('form_fixed01');
    expect(settings.meta).toBeUndefined();
  });

  it('gives each new workbook a different form id', () => {
    const first = createEmptyWorkbook().settings.rows[0]?.cells.form_id;
    const second = createEmptyWorkbook().settings.rows[0]?.cells.form_id;
    expect(first).not.toBe(second);
  });
});
