/**
 * Convert an ExcelJS cell value into the string the editor stores (AD-4).
 *
 * The rules mirror what the user sees in Excel:
 * - numbers honour an explicit number format (`2024010101`, `0007`), plain
 *   integers stay plain;
 * - booleans become `TRUE` / `FALSE`;
 * - dates become ISO `YYYY-MM-DD`;
 * - rich text is concatenated;
 * - formulas contribute their cached result.
 */
import type { CellValue } from 'exceljs';

export interface CoerceOptions {
  /** Excel number format of the cell, e.g. `0`, `0000`, `yyyy-mm-dd`. */
  numFmt?: string;
  /** ExcelJS `cell.text`, used for non-General number formats. */
  text?: string;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatDateIso(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Minimal Excel number-format rendering for the formats XLSForm files use:
 * zero padding (`0`, `0000`), fixed decimals (`0.00`), percentages and
 * thousands separators. Returns `undefined` for formats it does not model, so
 * the caller can fall back to ExcelJS's display text.
 */
export function formatNumberWithPattern(value: number, numFmt: string): string | undefined {
  const positive = numFmt.split(';')[0]?.trim() ?? '';
  if (!positive) return undefined;

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);

  if (/^0+$/.test(positive)) {
    const digits = Math.trunc(absolute).toString();
    return `${sign}${digits.padStart(positive.length, '0')}`;
  }

  const percent = /^0(?:\.(0+))?%$/.exec(positive);
  if (percent) {
    const decimals = percent[1]?.length ?? 0;
    return `${sign}${(absolute * 100).toFixed(decimals)}%`;
  }

  const grouped = /^#,##0(?:\.(0+))?$/.exec(positive);
  if (grouped) {
    const decimals = grouped[1]?.length ?? 0;
    return `${sign}${absolute.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  const fixed = /^0\.(0+)$/.exec(positive);
  if (fixed) {
    const decimals = fixed[1]?.length ?? 0;
    return `${sign}${absolute.toFixed(decimals)}`;
  }

  if (positive === '0') {
    return `${sign}${Math.trunc(absolute)}`;
  }

  return undefined;
}

function coerceNumber(value: number, options: CoerceOptions): string {
  const numFmt = options.numFmt?.trim();
  if (numFmt && numFmt.toLowerCase() !== 'general') {
    const formatted = formatNumberWithPattern(value, numFmt);
    if (formatted !== undefined) return formatted;
    const display = options.text;
    if (display !== undefined && display !== '') return display;
  }
  if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
    return String(value);
  }
  if (options.text) return options.text;
  return String(value);
}

function isRichText(value: object): value is { richText: Array<{ text?: string }> } {
  return 'richText' in value && Array.isArray((value as { richText?: unknown }).richText);
}

function isFormula(value: object): value is { result?: CellValue } {
  return 'formula' in value || 'sharedFormula' in value;
}

export function coerceCell(value: CellValue | undefined, options: CoerceOptions = {}): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return coerceNumber(value, options);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return formatDateIso(value);

  const object = value as unknown as Record<string, unknown>;

  if (isRichText(object)) {
    return object.richText.map((run) => run.text ?? '').join('');
  }
  if (isFormula(object)) {
    return coerceCell(object.result as CellValue | undefined, options);
  }
  if ('error' in object) {
    return String(object.error ?? '');
  }
  if ('text' in object && typeof object.text === 'string') {
    return object.text;
  }
  if ('hyperlink' in object && typeof object.hyperlink === 'string') {
    return object.hyperlink;
  }
  return '';
}

/** True when the cell displays nothing the editor should keep. */
export function isEmptyValue(value: CellValue | undefined): boolean {
  return coerceCell(value) === '';
}
