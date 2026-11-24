import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHOICES_COLUMNS,
  DEFAULT_SETTINGS_COLUMNS,
  DEFAULT_SURVEY_COLUMNS,
  XPATH_COLUMNS,
  localizedHeader,
  normalizeHeader,
  parseLanguageTag,
  resolveColumn,
} from './columns';

interface Case {
  header: string;
  base: string;
  canonical: string;
  language?: { name: string; code?: string };
  localizable?: boolean;
  xpath?: boolean;
  role: string;
}

const CASES: Case[] = [
  { header: 'type', base: 'type', canonical: 'type', role: 'structural' },
  { header: 'Type', base: 'type', canonical: 'type', role: 'structural' },
  { header: ' type ', base: 'type', canonical: 'type', role: 'structural' },
  { header: 'name', base: 'name', canonical: 'name', role: 'identity' },
  { header: 'NAME', base: 'name', canonical: 'name', role: 'identity' },
  { header: 'label', base: 'label', canonical: 'label', localizable: true, role: 'content' },
  { header: 'Label', base: 'label', canonical: 'label', localizable: true, role: 'content' },
  {
    header: 'label::English (en)',
    base: 'label',
    canonical: 'label',
    localizable: true,
    language: { name: 'English', code: 'en' },
    role: 'content',
  },
  {
    header: 'label::Indonesian (id)',
    base: 'label',
    canonical: 'label',
    localizable: true,
    language: { name: 'Indonesian', code: 'id' },
    role: 'content',
  },
  {
    header: 'label::English',
    base: 'label',
    canonical: 'label',
    localizable: true,
    language: { name: 'English' },
    role: 'content',
  },
  { header: 'hint', base: 'hint', canonical: 'hint', localizable: true, role: 'content' },
  {
    header: 'hint::French (fr)',
    base: 'hint',
    canonical: 'hint',
    localizable: true,
    language: { name: 'French', code: 'fr' },
    role: 'content',
  },
  { header: 'required', base: 'required', canonical: 'required', xpath: true, role: 'logic' },
  { header: 'Required', base: 'required', canonical: 'required', xpath: true, role: 'logic' },
  { header: 'relevant', base: 'relevant', canonical: 'relevant', xpath: true, role: 'logic' },
  { header: 'ReLeVaNt', base: 'relevant', canonical: 'relevant', xpath: true, role: 'logic' },
  { header: 'constraint', base: 'constraint', canonical: 'constraint', xpath: true, role: 'logic' },
  {
    header: 'constraint message',
    base: 'constraint_message',
    canonical: 'constraint_message',
    localizable: true,
    role: 'content',
  },
  {
    header: 'constraint_message',
    base: 'constraint_message',
    canonical: 'constraint_message',
    localizable: true,
    role: 'content',
  },
  {
    header: 'constraint message::Indonesian (id)',
    base: 'constraint_message',
    canonical: 'constraint_message',
    localizable: true,
    language: { name: 'Indonesian', code: 'id' },
    role: 'content',
  },
  {
    header: 'required message',
    base: 'required_message',
    canonical: 'required_message',
    localizable: true,
    role: 'content',
  },
  {
    header: 'calculation',
    base: 'calculation',
    canonical: 'calculation',
    xpath: true,
    role: 'logic',
  },
  {
    header: 'appearance',
    base: 'appearance',
    canonical: 'appearance',
    role: 'presentation',
  },
  { header: 'default', base: 'default', canonical: 'default', xpath: true, role: 'logic' },
  {
    header: 'choice_filter',
    base: 'choice_filter',
    canonical: 'choice_filter',
    xpath: true,
    role: 'logic',
  },
  {
    header: 'choice filter',
    base: 'choice_filter',
    canonical: 'choice_filter',
    xpath: true,
    role: 'logic',
  },
  {
    header: 'repeat_count',
    base: 'repeat_count',
    canonical: 'repeat_count',
    xpath: true,
    role: 'logic',
  },
  {
    header: 'repeat count',
    base: 'repeat_count',
    canonical: 'repeat_count',
    xpath: true,
    role: 'logic',
  },
  { header: 'trigger', base: 'trigger', canonical: 'trigger', xpath: true, role: 'logic' },
  { header: 'read_only', base: 'read_only', canonical: 'read_only', role: 'logic' },
  { header: 'readonly', base: 'read_only', canonical: 'read_only', role: 'logic' },
  { header: 'list_name', base: 'list_name', canonical: 'list_name', role: 'identity' },
  { header: 'list name', base: 'list_name', canonical: 'list_name', role: 'identity' },
  { header: 'List_Name', base: 'list_name', canonical: 'list_name', role: 'identity' },
  { header: 'image', base: 'image', canonical: 'media::image', localizable: true, role: 'content' },
  {
    header: 'media::image',
    base: 'image',
    canonical: 'media::image',
    localizable: true,
    role: 'content',
  },
  { header: 'audio', base: 'audio', canonical: 'media::audio', localizable: true, role: 'content' },
  {
    header: 'media::audio',
    base: 'audio',
    canonical: 'media::audio',
    localizable: true,
    role: 'content',
  },
  { header: 'video', base: 'video', canonical: 'media::video', localizable: true, role: 'content' },
  {
    header: 'media::video',
    base: 'video',
    canonical: 'media::video',
    localizable: true,
    role: 'content',
  },
  { header: 'note', base: 'note', canonical: 'note', role: 'content' },
  { header: 'parameter', base: 'parameter', canonical: 'parameters', role: 'logic' },
  { header: 'parameters', base: 'parameter', canonical: 'parameters', role: 'logic' },
  { header: 'style', base: 'style', canonical: 'style', role: 'presentation' },
  {
    header: 'form_title',
    base: 'form_title',
    canonical: 'form_title',
    role: 'content',
  },
  {
    header: 'form title',
    base: 'form_title',
    canonical: 'form_title',
    role: 'content',
  },
  { header: 'form_id', base: 'form_id', canonical: 'form_id', role: 'identity' },
  { header: 'version', base: 'version', canonical: 'version', role: 'content' },
  {
    header: 'default_language',
    base: 'default_language',
    canonical: 'default_language',
    role: 'content',
  },
  {
    header: 'instance_name',
    base: 'instance_name',
    canonical: 'instance_name',
    xpath: false,
    role: 'logic',
  },
  {
    header: 'allow_choice_duplicates',
    base: 'allow_choice_duplicates',
    canonical: 'allow_choice_duplicates',
    role: 'content',
  },
  {
    header: 'bind::esri:fieldType',
    base: 'custom',
    canonical: 'bind::esri:fieldType',
    role: 'custom',
  },
  {
    header: 'bind::odk:length',
    base: 'custom',
    canonical: 'bind::odk:length',
    role: 'custom',
  },
  {
    header: 'Custom Column',
    base: 'custom',
    canonical: 'Custom Column',
    role: 'custom',
  },
  { header: '', base: 'custom', canonical: '', role: 'custom' },
  {
    header: 'notes::English (en)',
    base: 'custom',
    canonical: 'notes::English (en)',
    role: 'custom',
  },
];

describe('resolveColumn', () => {
  it.each(CASES)('$header', (testCase) => {
    const resolved = resolveColumn(testCase.header);
    expect(resolved.base).toBe(testCase.base);
    expect(resolved.canonical).toBe(testCase.canonical);
    expect(resolved.header).toBe(testCase.header);
    expect(resolved.isLocalizable).toBe(testCase.localizable ?? false);
    expect(resolved.isXPath).toBe(testCase.xpath ?? false);
    expect(resolved.role).toBe(testCase.role);
    if (testCase.language) {
      expect(resolved.language).toEqual(testCase.language);
    } else {
      expect(resolved.language).toBeUndefined();
    }
  });

  it('classifies every header in the fixture corpus without falling back unexpectedly', () => {
    const expectedCustom = new Set([
      'bind::esri:fieldType',
      'bind::esri:fieldTypeNull',
      'bind::odk:length',
      'bind::odk:requiredMessage',
      'bind::odk:constraintMessage',
      'bind::odk:readonly',
      'body::accuracyThreshold',
      'body::intent',
      'custom_1',
      'custom_2',
      'custom_3',
      'list_name_filter',
    ]);
    for (const header of [
      'type',
      'name',
      'label::English (en)',
      'hint::Indonesian (id)',
      'required',
      'relevant',
      'constraint',
      'constraint_message',
      'calculation',
      'appearance',
      'default',
      'choice_filter',
      'repeat_count',
      'trigger',
      'read_only',
      'media::image',
      'media::audio',
      'media::video',
      'bind::esri:fieldType',
      'bind::esri:fieldTypeNull',
      'bind::odk:length',
      'bind::odk:requiredMessage',
      'bind::odk:constraintMessage',
      'bind::odk:readonly',
      'body::accuracyThreshold',
      'body::intent',
      'custom_1',
      'custom_2',
      'custom_3',
      'list_name_filter',
    ]) {
      const resolved = resolveColumn(header);
      if (expectedCustom.has(header)) {
        expect(resolved.base, header).toBe('custom');
      } else {
        expect(resolved.base, header).not.toBe('custom');
      }
    }
  });
});

describe('parseLanguageTag', () => {
  it('parses name and code', () => {
    expect(parseLanguageTag('label::Indonesian (id)')).toEqual({
      name: 'Indonesian',
      code: 'id',
    });
  });

  it('parses a name without a code', () => {
    expect(parseLanguageTag('label::English')).toEqual({ name: 'English' });
  });

  it('keeps spaces inside the display name', () => {
    expect(parseLanguageTag('label::Brazilian Portuguese (pt-BR)')).toEqual({
      name: 'Brazilian Portuguese',
      code: 'pt-BR',
    });
  });

  it('returns undefined without a suffix', () => {
    expect(parseLanguageTag('label')).toBeUndefined();
    expect(parseLanguageTag('label::')).toBeUndefined();
  });
});

describe('column presets and helpers', () => {
  it('uses the minimal 3-column default survey preset', () => {
    expect(DEFAULT_SURVEY_COLUMNS).toEqual(['type', 'name', 'label']);
    expect(DEFAULT_CHOICES_COLUMNS).toEqual(['list_name', 'name', 'label']);
    expect(DEFAULT_SETTINGS_COLUMNS).toContain('instance_name');
    for (const column of DEFAULT_SURVEY_COLUMNS) {
      expect(resolveColumn(column).base).not.toBe('custom');
    }
  });

  it('exposes the XPath column set', () => {
    expect(XPATH_COLUMNS).toContain('relevant');
    expect(XPATH_COLUMNS).toContain('required');
    expect(XPATH_COLUMNS).not.toContain('label');
  });

  it('normalizes headers for comparison without changing the stored text', () => {
    expect(normalizeHeader('  Label::English   (en) ')).toBe('label::english (en)');
    expect(resolveColumn('  Label  ').header).toBe('  Label  ');
  });

  it('builds localized headers', () => {
    expect(localizedHeader('label', { name: 'Indonesian', code: 'id' })).toBe(
      'label::Indonesian (id)',
    );
    expect(localizedHeader('hint', { name: 'English' })).toBe('hint::English');
    expect(localizedHeader('image', { name: 'French', code: 'fr' })).toBe(
      'media::image::French (fr)',
    );
  });
});
