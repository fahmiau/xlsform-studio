import { describe, expect, it } from 'vitest';

import type { SheetData } from '../model/types';
import type { Language } from './discover';
import {
  splitPair,
  translationSummary,
  untranslatedCellKeys,
  visibleColumns,
  type LanguageViewState,
} from './viewModes';

const english: Language = {
  id: 'English (en)',
  name: 'English',
  code: 'en',
  display: 'English (en)',
  columns: {
    survey: ['label::English (en)', 'hint::English (en)'],
    choices: ['label::English (en)'],
  },
};

const indonesian: Language = {
  id: 'Indonesian (id)',
  name: 'Indonesian',
  code: 'id',
  display: 'Indonesian (id)',
  columns: {
    survey: ['label::Indonesian (id)'],
    choices: ['label::Indonesian (id)'],
  },
};

const DEFAULT: Language = {
  id: 'Default',
  name: 'Default',
  display: 'Default',
  columns: { survey: ['label', 'hint'], choices: ['label'] },
};

const SURVEY_COLUMNS = [
  'type',
  'name',
  'label',
  'hint',
  'relevant',
  'label::English (en)',
  'label::Indonesian (id)',
];
const CHOICES_COLUMNS = ['list_name', 'name', 'label', 'label::English (en)'];

const ALL: LanguageViewState = { mode: 'all', language: null, source: null, target: null };

describe('visibleColumns (Task 5.4)', () => {
  it('all shows every column with the familiar frozen set', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [english], ALL);
    expect(result.columns).toEqual(SURVEY_COLUMNS);
    expect(result.frozen).toEqual(['type', 'name', 'label']);
  });

  it('settings always shows every column', () => {
    const columns = ['form_title', 'form_id'];
    const result = visibleColumns('settings', columns, [english], {
      mode: 'single',
      language: english.id,
    });
    expect(result.columns).toEqual(columns);
    expect(result.frozen).toEqual([]);
  });

  it('single hides other languages and keeps non-localized columns', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [DEFAULT, english], {
      mode: 'single',
      language: english.id,
    });
    expect(result.columns).toEqual(['type', 'name', 'relevant', 'label::English (en)']);
    expect(result.frozen).toEqual(['type', 'name', 'label::English (en)']);
  });

  it('single defaults to Default when no language is chosen', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [DEFAULT, english], {
      mode: 'single',
      language: null,
    });
    expect(result.columns).toEqual(['type', 'name', 'label', 'hint', 'relevant']);
  });

  it('split interleaves source and target translation columns', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [DEFAULT, english, indonesian], {
      mode: 'split',
      source: english.id,
      target: indonesian.id,
    });
    expect(result.columns).toEqual([
      'type',
      'name',
      'label::English (en)',
      'label::Indonesian (id)',
    ]);
    expect(result.frozen).toEqual(['type', 'name', 'label::English (en)']);
  });

  it('split on choices uses list_name/name as frozen', () => {
    const result = visibleColumns('choices', CHOICES_COLUMNS, [DEFAULT, english], {
      mode: 'split',
      source: DEFAULT.id,
      target: english.id,
    });
    expect(result.columns).toEqual(['list_name', 'name', 'label', 'label::English (en)']);
    expect(result.frozen).toEqual(['list_name', 'name', 'label']);
  });

  it('split with the same source and target does not duplicate columns', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [DEFAULT, english], {
      mode: 'split',
      source: english.id,
      target: english.id,
    });
    expect(result.columns).toEqual(['type', 'name', 'label::English (en)']);
  });

  it('falls back to all columns when no languages exist', () => {
    const result = visibleColumns('survey', SURVEY_COLUMNS, [], {
      mode: 'single',
      language: 'x',
    });
    expect(result.columns).toEqual(SURVEY_COLUMNS);
  });

  it('omits a frozen label that is hidden in single mode', () => {
    const columns = ['type', 'name', 'label::Indonesian (id)'];
    const result = visibleColumns('survey', columns, [DEFAULT, english, indonesian], {
      mode: 'single',
      language: english.id,
    });
    expect(result.columns).toEqual(['type', 'name']);
    expect(result.frozen).toEqual(['type', 'name']);
  });
});

describe('splitPair (Task 5.4)', () => {
  it('defaults to Default + the first other language', () => {
    const { source, target } = splitPair([DEFAULT, english], ALL);
    expect(source?.id).toBe(DEFAULT.id);
    expect(target?.id).toBe(english.id);
  });

  it('honours explicit source and target', () => {
    const { source, target } = splitPair([DEFAULT, english, indonesian], {
      mode: 'split',
      source: indonesian.id,
      target: english.id,
    });
    expect(source?.id).toBe(indonesian.id);
    expect(target?.id).toBe(english.id);
  });

  it('falls back to the source when only one language exists', () => {
    const { source, target } = splitPair([english], ALL);
    expect(source?.id).toBe(english.id);
    expect(target?.id).toBe(english.id);
  });

  it('returns undefined when there are no languages', () => {
    expect(splitPair([], ALL)).toEqual({ source: undefined, target: undefined });
  });
});

describe('translationSummary (Task 5.4)', () => {
  const sheet: SheetData = {
    sheetName: 'survey',
    columns: SURVEY_COLUMNS,
    rows: [
      { id: 'r1', cells: { 'label::English (en)': 'Hello', 'label::Indonesian (id)': 'Halo' } },
      { id: 'r2', cells: { 'label::English (en)': 'Hello again' } },
      { id: 'r3', cells: { 'label::English (en)': '   ' } },
    ],
  };

  it('counts filled source cells with an empty target', () => {
    const summary = translationSummary(
      sheet,
      [DEFAULT, english, indonesian],
      english.id,
      indonesian.id,
    );
    expect(summary.count).toBe(1);
  });

  it('reports tint keys for existing target columns', () => {
    const summary = translationSummary(
      sheet,
      [DEFAULT, english, indonesian],
      english.id,
      indonesian.id,
    );
    expect(summary.keys.has(`r2\u0000label::Indonesian (id)`)).toBe(true);
  });

  it('returns zero when the source language is missing', () => {
    expect(translationSummary(sheet, [DEFAULT], 'Klingon', 'Klingon')).toEqual({
      count: 0,
      keys: new Set(),
    });
  });

  it('counts a missing target column without a tint key', () => {
    const summary = translationSummary(sheet, [DEFAULT, english], english.id, 'Klingon');
    expect(summary.count).toBe(2);
    expect(summary.keys.size).toBe(0);
  });

  it('uses the choices sheet key for choices', () => {
    const summary = translationSummary(
      {
        sheetName: 'choices',
        columns: CHOICES_COLUMNS,
        rows: [{ id: 'c1', cells: { 'label::English (en)': 'Yes' } }],
      },
      [DEFAULT, english],
      english.id,
      DEFAULT.id,
    );
    expect(summary.count).toBe(1);
  });

  it('untranslatedCellKeys exposes only the keys', () => {
    const keys = untranslatedCellKeys(
      sheet,
      [DEFAULT, english, indonesian],
      english.id,
      indonesian.id,
    );
    expect(keys).toEqual(new Set([`r2\u0000label::Indonesian (id)`]));
  });
});
