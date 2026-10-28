import { describe, expect, it } from 'vitest';

import type { SheetData } from '@/core/model/types';

import {
  CHOICES_GRID_CONFIG,
  SETTINGS_GRID_CONFIG,
  SURVEY_GRID_CONFIG,
  buildDisplayColumns,
  columnKeyAt,
  moveDisplayColumn,
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

  it('defaults the gutter to 88 px and accepts a compact width', () => {
    const wide = buildDisplayColumns(sheet(['type']), SURVEY_GRID_CONFIG);
    const wideGutter = wide.columns[0];
    expect(wideGutter && 'width' in wideGutter ? wideGutter.width : undefined).toBe(88);

    // The drawer keeps Glide's 32 px row markers, so its own gutter stays 48 px.
    const compact = buildDisplayColumns(
      { sheetName: 'choices', columns: ['label', 'name'], rows: [] },
      CHOICES_GRID_CONFIG,
      { gutterWidth: 48 },
    );
    const compactGutter = compact.columns[0];
    expect(compactGutter && 'width' in compactGutter ? compactGutter.width : undefined).toBe(48);
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

describe('buildDisplayColumns with a session order (Category C4)', () => {
  const columns = ['type', 'name', 'label', 'hint', 'required', 'relevant'];

  it('applies the order to the scrollable block before frozen extraction', () => {
    const display = buildDisplayColumns(sheet(columns), SURVEY_GRID_CONFIG, {
      order: ['relevant', 'hint', 'required'],
    });
    expect(display.keys).toEqual(['type', 'name', 'label', 'relevant', 'hint', 'required']);
    expect(display.frozenCount).toBe(4);
  });

  it('reorders within the frozen block without changing its set or count', () => {
    const display = buildDisplayColumns(sheet(columns), SURVEY_GRID_CONFIG, {
      order: ['name', 'type', 'label', 'hint', 'required', 'relevant'],
    });
    expect(display.keys).toEqual(['name', 'type', 'label', 'hint', 'required', 'relevant']);
    expect(display.frozenCount).toBe(4);
    expect(new Set(display.keys.slice(0, 3))).toEqual(new Set(['type', 'name', 'label']));
  });

  it('does not resurrect hidden columns listed in the order', () => {
    const display = buildDisplayColumns(sheet(columns), SURVEY_GRID_CONFIG, {
      order: ['relevant', 'hint', 'required'],
      hidden: new Set(['hint']),
    });
    expect(display.keys).toEqual(['type', 'name', 'label', 'relevant', 'required']);
  });

  it('appends columns missing from the order in file order', () => {
    const display = buildDisplayColumns(sheet(columns), SURVEY_GRID_CONFIG, {
      order: ['relevant'],
    });
    expect(display.keys).toEqual(['type', 'name', 'label', 'relevant', 'hint', 'required']);
  });

  it('applies the order to language-view keys and keeps the frozen block leftmost', () => {
    const display = buildDisplayColumns(
      sheet(['type', 'name', 'label', 'label::English (en)', 'hint', 'relevant']),
      SURVEY_GRID_CONFIG,
      {
        keys: ['type', 'name', 'label::English (en)', 'hint', 'relevant'],
        frozen: ['type', 'name', 'label::English (en)'],
        order: ['name', 'type', 'label::English (en)', 'relevant', 'hint'],
      },
    );
    expect(display.keys).toEqual(['name', 'type', 'label::English (en)', 'relevant', 'hint']);
    expect(display.frozenCount).toBe(4);
  });

  it('never mutates the sheet file order or header text', () => {
    const data = sheet(columns, { hint: 'Hint text' });
    const before = [...data.columns];
    const headerBefore = { ...data.headerText };

    const display = buildDisplayColumns(data, SURVEY_GRID_CONFIG, {
      order: ['relevant', 'hint', 'required'],
    });

    expect(data.columns).toEqual(before);
    expect(data.headerText).toEqual(headerBefore);
    expect(display.keys).not.toEqual(data.columns);
    const hint = display.columns.find((column) => 'id' in column && column.id === 'hint');
    expect(hint && 'title' in hint ? hint.title : undefined).toBe('Hint text');
  });
});

describe('moveDisplayColumn (Category C4)', () => {
  const display = {
    keys: ['type', 'name', 'label', 'hint', 'required', 'relevant'],
    frozenCount: 4,
  };

  it('moves a scrollable column onto the target position', () => {
    expect(moveDisplayColumn(display, 6, 4)).toEqual([
      'type',
      'name',
      'label',
      'relevant',
      'hint',
      'required',
    ]);
  });

  it('moves a frozen column within the frozen block', () => {
    expect(moveDisplayColumn(display, 1, 2)).toEqual([
      'name',
      'type',
      'label',
      'hint',
      'required',
      'relevant',
    ]);
  });

  it('rejects cross-region moves in both directions', () => {
    expect(moveDisplayColumn(display, 1, 4)).toBeUndefined();
    expect(moveDisplayColumn(display, 4, 1)).toBeUndefined();
  });

  it('rejects moves touching the gutter or an invalid index', () => {
    expect(moveDisplayColumn(display, 0, 4)).toBeUndefined();
    expect(moveDisplayColumn(display, 4, 0)).toBeUndefined();
    expect(moveDisplayColumn(display, 4, 4)).toBeUndefined();
    expect(moveDisplayColumn(display, 99, 4)).toBeUndefined();
  });
});
