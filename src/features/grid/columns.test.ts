import { describe, expect, it } from 'vitest';

import type { SheetData } from '@/core/model/types';

import {
  CHOICES_GRID_CONFIG,
  SETTINGS_GRID_CONFIG,
  SURVEY_GRID_CONFIG,
  buildDisplayColumns,
  columnKeyAt,
} from './columns';

function sheet(columns: string[], headerText?: Record<string, string>): SheetData {
  return { sheetName: 'survey', columns, rows: [], ...(headerText ? { headerText } : {}) };
}

describe('buildDisplayColumns (Task 2.2)', () => {
  it('pulls type, name, and the primary label to the front', () => {
    const display = buildDisplayColumns(
      sheet(['hint', 'label', 'type', 'name', 'relevant', 'custom_x']),
      SURVEY_GRID_CONFIG,
    );
    expect(display.keys).toEqual(['type', 'name', 'label', 'hint', 'relevant', 'custom_x']);
    expect(display.frozenCount).toBe(4);
    expect(display.columns[0]?.id).toBe('__gutter__');
  });

  it('uses the localized label when no plain label exists', () => {
    const display = buildDisplayColumns(
      sheet(['type', 'name', 'label::English (en)', 'hint']),
      SURVEY_GRID_CONFIG,
    );
    expect(display.keys.slice(0, 3)).toEqual(['type', 'name', 'label::English (en)']);
  });

  it('keeps the file order after the frozen set and maps column keys', () => {
    const display = buildDisplayColumns(
      sheet(['z_custom', 'type', 'a_custom', 'name', 'label']),
      SURVEY_GRID_CONFIG,
    );
    expect(display.keys).toEqual(['type', 'name', 'label', 'z_custom', 'a_custom']);
    expect(columnKeyAt(display, 0)).toBeUndefined();
    expect(columnKeyAt(display, 1)).toBe('type');
    expect(columnKeyAt(display, 5)).toBe('a_custom');
  });

  it('hides view-only columns and keeps widths', () => {
    const display = buildDisplayColumns(
      sheet(['type', 'name', 'label', 'hint']),
      SURVEY_GRID_CONFIG,
      { widths: { label: 333 }, hidden: new Set(['hint']) },
    );
    expect(display.keys).toEqual(['type', 'name', 'label']);
    const label = display.columns.find((column) => 'id' in column && column.id === 'label');
    expect(label && 'width' in label ? label.width : undefined).toBe(333);
  });

  it('uses the choices and settings frozen sets', () => {
    const choices = buildDisplayColumns(
      { sheetName: 'choices', columns: ['label', 'image', 'name', 'list_name'], rows: [] },
      CHOICES_GRID_CONFIG,
    );
    expect(choices.keys).toEqual(['list_name', 'name', 'label', 'image']);
    expect(choices.frozenCount).toBe(4);

    const settings = buildDisplayColumns(
      { sheetName: 'settings', columns: ['version', 'form_title', 'custom'], rows: [] },
      SETTINGS_GRID_CONFIG,
    );
    expect(settings.keys).toEqual(['version', 'form_title', 'custom']);
    expect(settings.frozenCount).toBe(1);
  });

  it('shows the original header text for duplicate or headerless columns', () => {
    const display = buildDisplayColumns(
      sheet(['type', 'label#2', 'column_4'], { 'label#2': 'label', column_4: '' }),
      SURVEY_GRID_CONFIG,
    );
    expect(display.columns[1]?.title).toBe('type');
    expect(display.columns[2]?.title).toBe('label');
    expect(display.columns[3]?.title).toBe('');
  });
});
