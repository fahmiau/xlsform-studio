import { describe, expect, it } from 'vitest';

import { appearanceSuggestions, isKnownAppearance } from './appearances';

describe('appearance catalog (Task 3.1)', () => {
  it('filters layout suggestions by the row base type', () => {
    const select = appearanceSuggestions('select_one water_source');
    expect(select.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['minimal', 'quick', 'likert', 'horizontal']),
    );
    expect(select.map((entry) => entry.name)).not.toContain('multiline');
    expect(select.map((entry) => entry.name)).not.toContain('month-year');
  });

  it('offers date-specific and numeric-specific appearances', () => {
    expect(appearanceSuggestions('date').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['month-year', 'year', 'no-calendar']),
    );
    expect(appearanceSuggestions('range').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['distress', 'rating', 'vertical', 'no-ticks']),
    );
  });

  it('always includes width helpers and group layouts where relevant', () => {
    expect(appearanceSuggestions('text').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['w1', 'w5', 'multiline']),
    );
    expect(appearanceSuggestions('begin_group').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['field-list', 'table-list', 'w1']),
    );
  });

  it('is case and alias tolerant', () => {
    const names = appearanceSuggestions('Select One').map((entry) => entry.name);
    expect(names).toContain('likert');
    expect(appearanceSuggestions('begin group').map((entry) => entry.name)).toContain('field-list');
  });

  it('reports known appearances, including widths', () => {
    expect(isKnownAppearance('select_one x', 'minimal')).toBe(true);
    expect(isKnownAppearance('integer', 'w3')).toBe(true);
    expect(isKnownAppearance('integer', 'month-year')).toBe(false);
    expect(isKnownAppearance('integer', 'custom-thing')).toBe(false);
  });
});
