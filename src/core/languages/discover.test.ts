import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from '../model/factory';
import type { WorkbookData } from '../model/types';
import {
  DEFAULT_LANGUAGE_ID,
  defaultLanguage,
  discoverLanguages,
  findLanguage,
  formatLanguageTag,
  labelColumnFor,
  primaryLabelColumn,
} from './discover';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.columns.push('label::English (en)', 'hint::English (en)', 'label::French');
  data.choices.columns.push('label::English (en)');
  return data;
}

describe('discoverLanguages (Task 5.3)', () => {
  it('collects unsuffixed localizable columns as Default', () => {
    const languages = discoverLanguages(createEmptyWorkbook());
    expect(languages.map((language) => language.id)).toEqual([DEFAULT_LANGUAGE_ID]);
    expect(languages[0]?.columns.survey).toContain('label');
    expect(languages[0]?.columns.choices).toContain('label');
  });

  it('groups suffixed columns into languages', () => {
    const languages = discoverLanguages(workbook());
    const english = findLanguage(languages, 'English');
    expect(english?.display).toBe('English (en)');
    expect(english?.code).toBe('en');
    expect(english?.columns.survey).toEqual(['label::English (en)', 'hint::English (en)']);
    expect(english?.columns.choices).toEqual(['label::English (en)']);
  });

  it('tolerates a missing code', () => {
    const languages = discoverLanguages(workbook());
    const french = findLanguage(languages, 'French');
    expect(french?.display).toBe('French');
    expect(french?.code).toBeUndefined();
  });

  it('upgrades the id when a later header adds a code', () => {
    const data = createEmptyWorkbook();
    data.survey.columns.push('label::Spanish', 'label::Spanish (es)');
    const languages = discoverLanguages(data);
    const spanish = findLanguage(languages, 'Spanish');
    expect(spanish?.code).toBe('es');
    expect(spanish?.display).toBe('Spanish (es)');
    expect(spanish?.columns.survey).toEqual(['label::Spanish', 'label::Spanish (es)']);
  });

  it('keeps first-seen header order', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name', 'label::French (fr)', 'label::English (en)'];
    data.choices.columns = ['list_name', 'name'];
    expect(discoverLanguages(data).map((language) => language.name)).toEqual(['French', 'English']);
  });

  it('ignores non-localizable columns', () => {
    const data = createEmptyWorkbook();
    data.survey.columns.push('appearance');
    expect(discoverLanguages(data)).toHaveLength(1);
  });

  it('returns an empty list when there is nothing localizable', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name'];
    data.choices.columns = ['list_name', 'name'];
    expect(discoverLanguages(data)).toEqual([]);
  });
});

describe('findLanguage (Task 5.3)', () => {
  it('matches display, name, and code case-insensitively', () => {
    const languages = discoverLanguages(workbook());
    expect(findLanguage(languages, 'English (en)')?.name).toBe('English');
    expect(findLanguage(languages, 'english (EN)')?.name).toBe('English');
    expect(findLanguage(languages, 'en')?.name).toBe('English');
    expect(findLanguage(languages, 'English')?.name).toBe('English');
  });

  it('returns undefined for empty or unknown identifiers', () => {
    const languages = discoverLanguages(workbook());
    expect(findLanguage(languages, null)).toBeUndefined();
    expect(findLanguage(languages, '')).toBeUndefined();
    expect(findLanguage(languages, 'Klingon')).toBeUndefined();
  });
});

describe('formatLanguageTag (Task 5.3)', () => {
  it('formats with and without a code', () => {
    expect(formatLanguageTag({ name: 'English', code: 'en' })).toBe('English (en)');
    expect(formatLanguageTag({ name: 'English' })).toBe('English');
  });
});

describe('defaultLanguage (Task 5.3)', () => {
  it('prefers a matching settings.default_language', () => {
    const data = workbook();
    data.settings.rows[0]!.cells.default_language = 'English (en)';
    expect(defaultLanguage(data)?.name).toBe('English');
  });

  it('matches the code form too', () => {
    const data = workbook();
    data.settings.rows[0]!.cells.default_language = 'en';
    expect(defaultLanguage(data)?.name).toBe('English');
  });

  it('falls back to Default when the setting is unknown', () => {
    const data = workbook();
    data.settings.rows[0]!.cells.default_language = 'Klingon';
    expect(defaultLanguage(data)?.id).toBe(DEFAULT_LANGUAGE_ID);
  });

  it('falls back to the first language when there is no Default', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name', 'label::English (en)'];
    data.choices.columns = ['list_name', 'name', 'label::English (en)'];
    expect(defaultLanguage(data)?.name).toBe('English');
  });

  it('returns undefined with no localizable columns', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name'];
    data.choices.columns = ['list_name', 'name'];
    expect(defaultLanguage(data)).toBeUndefined();
  });
});

describe('labelColumnFor / primaryLabelColumn (Task 5.3)', () => {
  it('resolves by display, name, and code', () => {
    const data = workbook();
    expect(labelColumnFor(data.survey, 'English (en)')).toBe('label::English (en)');
    expect(labelColumnFor(data.survey, 'en')).toBe('label::English (en)');
    expect(labelColumnFor(data.survey, 'French')).toBe('label::French');
  });

  it('falls back to the unsuffixed label', () => {
    const data = workbook();
    expect(labelColumnFor(data.survey, 'Klingon')).toBe('label');
    expect(labelColumnFor(data.survey)).toBe('label');
  });

  it('falls back to the first label when there is no unsuffixed column', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name', 'label::English (en)'];
    expect(labelColumnFor(data.survey, 'Klingon')).toBe('label::English (en)');
  });

  it('returns undefined when the sheet has no label column', () => {
    const data = createEmptyWorkbook();
    data.survey.columns = ['type', 'name'];
    expect(labelColumnFor(data.survey)).toBeUndefined();
  });

  it('primaryLabelColumn follows settings.default_language', () => {
    const data = workbook();
    data.settings.rows[0]!.cells.default_language = 'French';
    expect(primaryLabelColumn(data.survey, data)).toBe('label::French');
    expect(primaryLabelColumn(data.choices, data)).toBe('label');
  });
});
