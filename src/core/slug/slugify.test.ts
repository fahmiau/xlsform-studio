import { describe, expect, it } from 'vitest';

import type { Row, SheetData } from '../model/types';
import {
  SLUG_MAX_LENGTH,
  autoChoiceName,
  detectListMode,
  inferNameLocked,
  inferNameLocks,
  numericName,
  slugify,
  uniqueName,
} from './slugify';

function row(cells: Record<string, string>): Row {
  return { id: Math.random().toString(36).slice(2), cells };
}

function sheet(rows: Row[], columns = ['list_name', 'name', 'label']): SheetData {
  return { sheetName: 'choices', columns, rows };
}

describe('slugify (Task 3.2)', () => {
  it.each([
    ['Drinking Water (Bottled/Refill)', 'drinking_water_bottled_refill'],
    ['Yes', 'yes'],
    ['  Many   spaces  ', 'many_spaces'],
    ['Hyphen-ated', 'hyphen_ated'],
    ['Underscores__stay', 'underscores_stay'],
    ['100% pure', '100_pure'],
    ['École primaire', 'ecole_primaire'],
    ['Ça va très bien', 'ca_va_tres_bien'],
    ['Air Minum Kemasan', 'air_minum_kemasan'],
    ['Ñandú', 'nandu'],
    ['Water (Bottled/Refill)', 'water_bottled_refill'],
    ['123 Main Street', '123_main_street'],
    ['2.5 kg', '2_5_kg'],
    ['Emoji 🎉 party', 'emoji_party'],
    ['مرحبا', 'opt_1'],
    ['こんにちは', 'opt_1'],
    ['中文标签', 'opt_1'],
    ['😀😀', 'opt_1'],
    ['', 'opt_1'],
    ['___', 'opt_1'],
    ['A', 'a'],
    ['A_B', 'a_b'],
    ['A B C', 'a_b_c'],
    ['  leading', 'leading'],
    ['trailing  ', 'trailing'],
    ['MiXeD CaSe', 'mixed_case'],
    ['multi--dash', 'multi_dash'],
    ['dot.separated', 'dot_separated'],
    ['plus+sign', 'plus_sign'],
    ['50%', '50'],
    ['v1.2.3', 'v1_2_3'],
    ['Héllo Wörld', 'hello_world'],
    ['naïve', 'naive'],
    ['São Paulo', 'sao_paulo'],
    ['北京 Beijing', 'beijing'],
    ['Tab\tseparated', 'tab_separated'],
    ['line\nbreak', 'line_break'],
    ['CamelCase', 'camelcase'],
    ['already_snake', 'already_snake'],
    ['--dash--', 'dash'],
    ['0start', '0start'],
    ['UPPER', 'upper'],
  ])('slugifies %j to %j', (label, expected) => {
    expect(slugify(label)).toBe(expected);
    expect(slugify(label)).toBe(slugify(label));
  });

  it('uses the provided fallback index for labels without ASCII', () => {
    expect(slugify('日本語', { index: 4 })).toBe('opt_4');
  });

  it('truncates to 32 chars at the last underscore boundary', () => {
    const slug = slugify('one two three four five six seven eight');
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toBe('one_two_three_four_five_six');
  });

  it('hard-cuts a single long word when there is no boundary', () => {
    const slug = slugify('a'.repeat(50));
    expect(slug).toBe('a'.repeat(32));
  });

  it('honours a custom max length', () => {
    expect(slugify('alpha beta gamma', { maxLength: 10 })).toBe('alpha_beta');
  });
});

describe('numericName', () => {
  it('produces 1-based numbers, with or without a prefix', () => {
    expect(numericName(1)).toBe('1');
    expect(numericName(3)).toBe('3');
    expect(numericName(2, 'opt')).toBe('opt_2');
    expect(numericName(2, 'opt_')).toBe('opt_2');
    expect(numericName(0)).toBe('1');
  });
});

describe('uniqueName', () => {
  it('returns the base when free and appends counters otherwise', () => {
    expect(uniqueName('other', new Set())).toBe('other');
    expect(uniqueName('other', new Set(['other']))).toBe('other_2');
    expect(uniqueName('other', new Set(['other', 'other_2']))).toBe('other_3');
  });

  it('re-truncates the base so the suffix fits within 32 chars', () => {
    const base = 'a_very_long_slug_that_is_already_32';
    const existing = new Set([slugify(base)]);
    const next = uniqueName(base, existing);
    expect(next.length).toBeLessThanOrEqual(32);
    expect(next.endsWith('_2')).toBe(true);
    expect(next).not.toContain('__');
  });

  it('slugs the base and falls back for empty input', () => {
    expect(uniqueName('Drinking Water', new Set())).toBe('drinking_water');
    expect(uniqueName('', new Set())).toMatch(/^opt/);
  });

  it('can preserve camelCase or passthrough spellings', () => {
    expect(uniqueName('drinkingWater', new Set(), 32, { slug: false })).toBe('drinkingWater');
    expect(uniqueName('Drinking Water', new Set(), 32, { slug: false })).toBe('Drinking Water');
    expect(uniqueName('drinkingWater', new Set(['drinkingWater']), 32, { slug: false })).toBe(
      'drinkingWater_2',
    );
  });
});

describe('detectListMode (AD-14)', () => {
  it('detects numeric lists', () => {
    expect(detectListMode(['1', '2', '3'])).toEqual({ kind: 'numeric' });
  });

  it('detects a shared prefix', () => {
    expect(detectListMode(['opt_1', 'opt_2'])).toEqual({ kind: 'prefix', prefix: 'opt' });
    expect(detectListMode(['v10_1', 'v10_2'])).toEqual({ kind: 'prefix', prefix: 'v10' });
  });

  it('falls back to snake for mixed or non-numeric names', () => {
    expect(detectListMode(['yes', 'no'])).toEqual({ kind: 'snake' });
    expect(detectListMode(['1', 'opt_2'])).toEqual({ kind: 'snake' });
    expect(detectListMode(['opt_1', 'other_2'])).toEqual({ kind: 'snake' });
    expect(detectListMode([])).toEqual({ kind: 'snake' });
    expect(detectListMode([''])).toEqual({ kind: 'snake' });
  });

  it('detects camelCase when a name has an uppercase letter', () => {
    expect(detectListMode(['drinkingWater', 'bottledWater'])).toEqual({ kind: 'camel' });
    expect(detectListMode(['north', 'south'])).toEqual({ kind: 'snake' });
    expect(detectListMode(['drinking_water'])).toEqual({ kind: 'snake' });
  });

  it('uses the fallback only for a list without names', () => {
    expect(detectListMode([], { kind: 'camel' })).toEqual({ kind: 'camel' });
    expect(detectListMode([''], { kind: 'passthrough' })).toEqual({ kind: 'passthrough' });
    expect(detectListMode(['yes', 'no'], { kind: 'camel' })).toEqual({ kind: 'snake' });
    expect(detectListMode(['1', '2'], { kind: 'camel' })).toEqual({ kind: 'numeric' });
  });
});

describe('autoChoiceName and inferNameLocked', () => {
  it('generates names for every mode', () => {
    expect(autoChoiceName('Clean water', { kind: 'snake' })).toBe('clean_water');
    expect(autoChoiceName('Clean water', { kind: 'numeric' }, 2)).toBe('2');
    expect(autoChoiceName('Clean water', { kind: 'prefix', prefix: 'opt' }, 2)).toBe('opt_2');
  });

  it('locks rows whose name differs from the auto name', () => {
    expect(
      inferNameLocked(row({ name: 'clean_water', label: 'Clean water' }), { kind: 'snake' }),
    ).toBe(false);
    expect(inferNameLocked(row({ name: 'cw', label: 'Clean water' }), { kind: 'snake' })).toBe(
      true,
    );
    expect(inferNameLocked(row({ name: '2', label: 'Two' }), { kind: 'numeric' }, 2)).toBe(false);
    expect(
      inferNameLocked(row({ name: 'opt_2', label: 'Two' }), { kind: 'prefix', prefix: 'opt' }, 2),
    ).toBe(false);
    expect(inferNameLocked(row({ name: '', label: 'Two' }), { kind: 'snake' })).toBe(true);
    expect(inferNameLocked(row({}), { kind: 'snake' })).toBe(false);
  });
});

describe('inferNameLocks (reader hook)', () => {
  it('locks imported codes that differ from the list convention', () => {
    const choices = sheet([
      row({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
      row({ list_name: 'yes_no', name: 'n', label: 'No' }),
      row({ list_name: 'scale', name: '1', label: 'Low' }),
      row({ list_name: 'scale', name: '2', label: 'High' }),
      row({ list_name: 'opt', name: 'opt_1', label: 'One' }),
      row({ list_name: 'opt', name: 'opt_2', label: 'Two' }),
    ]);
    inferNameLocks(choices);
    expect(choices.rows.map((candidate) => candidate.meta?.nameLocked ?? false)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('reads mixed-case name and label headers', () => {
    const choices = sheet(
      [
        row({ list_name: 'yes_no', Name: 'yes', Label: 'Yes' }),
        row({ list_name: 'yes_no', Name: 'n', Label: 'No' }),
      ],
      ['list_name', 'Name', 'Label'],
    );
    inferNameLocks(choices);
    expect(choices.rows.map((candidate) => candidate.meta?.nameLocked ?? false)).toEqual([
      false,
      true,
    ]);
  });

  it('uses the primary localized label column and clears stale locks', () => {
    const choices = sheet(
      [
        {
          id: 'a',
          cells: { list_name: 'yes_no', name: 'yes', 'label::English (en)': 'Yes' },
          meta: { nameLocked: true },
        },
        {
          id: 'b',
          cells: { list_name: 'yes_no', name: 'no', 'label::English (en)': 'No' },
        },
      ],
      ['list_name', 'name', 'label::English (en)'],
    );
    inferNameLocks(choices);
    expect(choices.rows[0]?.meta?.nameLocked).toBeUndefined();
    expect(choices.rows[1]?.meta?.nameLocked).toBeUndefined();
  });

  it('ignores rows without a list name and sheets without name/list columns', () => {
    const unlisted = sheet([row({ name: 'x', label: 'X' })]);
    inferNameLocks(unlisted);
    expect(unlisted.rows[0]?.meta).toBeUndefined();

    const broken = sheet([row({ label: 'X' })], ['label']);
    expect(() => inferNameLocks(broken)).not.toThrow();
  });

  it('is deterministic across runs', () => {
    const build = () =>
      sheet([
        row({ list_name: 'l', name: 'a', label: 'A' }),
        row({ list_name: 'l', name: 'b', label: 'B' }),
      ]);
    const first = build();
    const second = build();
    inferNameLocks(first);
    inferNameLocks(second);
    expect(first.rows.map((r) => r.meta)).toEqual(second.rows.map((r) => r.meta));
  });
});
