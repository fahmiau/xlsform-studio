// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { coerceCell, formatNumberWithPattern, formatDateIso, isEmptyValue } from './coerce';

describe('coerceCell', () => {
  it('handles empty values', () => {
    expect(coerceCell(null)).toBe('');
    expect(coerceCell(undefined)).toBe('');
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
  });

  it('keeps strings verbatim, including whitespace', () => {
    expect(coerceCell('  padded  ')).toBe('  padded  ');
    expect(coerceCell('select_one list')).toBe('select_one list');
  });

  it('renders integers without exponent notation', () => {
    expect(coerceCell(2024010101)).toBe('2024010101');
    expect(coerceCell(-42)).toBe('-42');
    expect(coerceCell(0)).toBe('0');
  });

  it('uses the Excel display text for explicit number formats', () => {
    expect(coerceCell(2024010101, { numFmt: '0', text: '2024010101' })).toBe('2024010101');
    expect(coerceCell(7, { numFmt: '0000', text: '0007' })).toBe('0007');
    expect(coerceCell(0.125, { numFmt: '0.00%', text: '12.50%' })).toBe('12.50%');
  });

  it('falls back to the value when General is set', () => {
    expect(coerceCell(12.5, { numFmt: 'General', text: '12.5' })).toBe('12.5');
  });

  it('renders booleans like Excel', () => {
    expect(coerceCell(true)).toBe('TRUE');
    expect(coerceCell(false)).toBe('FALSE');
  });

  it('renders dates as ISO days in UTC', () => {
    expect(coerceCell(new Date(Date.UTC(2024, 1, 3)))).toBe('2024-02-03');
    expect(coerceCell(new Date(Date.UTC(2024, 10, 12, 23, 59)))).toBe('2024-11-12');
    expect(formatDateIso(new Date('nope'))).toBe('');
  });

  it('concatenates rich text runs', () => {
    expect(
      coerceCell({
        richText: [
          { text: 'Bold', font: { bold: true } },
          { text: ' and ' },
          { text: 'plain', font: { italic: true } },
        ],
      }),
    ).toBe('Bold and plain');
  });

  it('uses the cached formula result and ignores the formula text', () => {
    expect(coerceCell({ formula: 'SUM(1,2)', result: 3 })).toBe('3');
    expect(coerceCell({ formula: 'A1', result: 'text' })).toBe('text');
    expect(coerceCell({ formula: 'A1', result: true })).toBe('TRUE');
    expect(coerceCell({ sharedFormula: 'A1', result: 42 })).toBe('42');
    expect(coerceCell({ formula: 'A1' })).toBe('');
  });

  it('handles errors, hyperlinks, and plain text objects', () => {
    expect(coerceCell({ error: '#N/A' })).toBe('#N/A');
    expect(coerceCell({ text: 'Click here', hyperlink: 'https://example.org' })).toBe('Click here');
    expect(coerceCell({ hyperlink: 'https://example.org' } as never)).toBe('https://example.org');
  });

  it('renders common Excel number formats', () => {
    expect(formatNumberWithPattern(7, '0000')).toBe('0007');
    expect(formatNumberWithPattern(-7, '000')).toBe('-007');
    expect(formatNumberWithPattern(0.125, '0.00%')).toBe('12.50%');
    expect(formatNumberWithPattern(0.5, '0%')).toBe('50%');
    expect(formatNumberWithPattern(12.345, '0.00')).toBe('12.35');
    expect(formatNumberWithPattern(1234567, '#,##0')).toBe('1,234,567');
    expect(formatNumberWithPattern(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatNumberWithPattern(12.9, '0')).toBe('12');
    expect(formatNumberWithPattern(1.5, '0.0E+00')).toBeUndefined();
    expect(formatNumberWithPattern(1.5, '')).toBeUndefined();
  });

  it('falls back to the display text for formats it does not model', () => {
    expect(coerceCell(1.5, { numFmt: '0.0E+00', text: '1.5E+00' })).toBe('1.5E+00');
    expect(coerceCell(1.5, { numFmt: '0.0E+00', text: '' })).toBe('1.5');
  });
});
