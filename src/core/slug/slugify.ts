/**
 * Deterministic choice-name slugification (Task 3.2, PRD §4.3).
 *
 * Pure and dependency-free (AD-1). All functions are total: malformed or
 * non-Latin labels fall back to `opt_<n>` instead of throwing.
 */
import { labelColumnFor } from '../languages/discover';
import { resolveColumn } from '../model/columns';
import type { Row, SheetData } from '../model/types';

export const SLUG_MAX_LENGTH = 32;

/** Naming styles a *new* list can start from (Preferences → Choices). */
export type SlugStyle = 'snake' | 'camel' | 'passthrough';

export type ListMode =
  | { kind: 'snake' }
  | { kind: 'numeric' }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'camel' }
  | { kind: 'passthrough' };

export interface SlugifyOptions {
  /** Maximum length. Defaults to {@link SLUG_MAX_LENGTH}. */
  maxLength?: number;
  /** 1-based fallback number used when the label has no usable ASCII. */
  index?: number;
}

function truncateAtBoundary(value: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  const head = value.slice(0, maxLength);
  // A cut that lands exactly on a separator is already a word boundary.
  if (value[maxLength] === '_') return head;
  const boundary = head.lastIndexOf('_');
  const cut = boundary > 0 ? head.slice(0, boundary) : head;
  return cut.replace(/_+$/, '');
}

/** `"Drinking Water (Bottled/Refill)"` → `drinking_water_bottled_refill`. */
export function slugify(label: string, options: SlugifyOptions = {}): string {
  const maxLength = Math.max(1, options.maxLength ?? SLUG_MAX_LENGTH);
  const ascii = (label ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (ascii === '') return `opt_${Math.max(1, options.index ?? 1)}`;
  const truncated = truncateAtBoundary(ascii, maxLength);
  return truncated === '' ? `opt_${Math.max(1, options.index ?? 1)}` : truncated;
}

/** Human-facing sequence: `1, 2, 3…` or `opt_1, opt_2…`. */
export function numericName(index: number, prefix?: string): string {
  const value = Math.max(1, Math.trunc(index));
  if (!prefix) return String(value);
  const stem = prefix.replace(/_+$/, '');
  return stem ? `${stem}_${value}` : String(value);
}

export interface UniqueNameOptions {
  /**
   * Slugify `base` before de-duplicating. Set to `false` for camelCase or
   * passthrough names, whose spelling is already meaningful.
   */
  slug?: boolean;
}

/** Append `_2`, `_3`… while keeping the base plus suffix within `maxLength`. */
export function uniqueName(
  base: string,
  existing: ReadonlySet<string>,
  maxLength = SLUG_MAX_LENGTH,
  options: UniqueNameOptions = {},
): string {
  const limit = Math.max(1, maxLength);
  const stem =
    options.slug === false ? base || 'opt' : slugify(base || 'opt', { maxLength: limit });
  if (!existing.has(stem)) return stem;
  for (let counter = 2; counter < 10_000; counter += 1) {
    const suffix = `_${counter}`;
    const trimmed = truncateAtBoundary(stem, limit - suffix.length);
    const candidate = `${trimmed || 'opt'}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${truncateAtBoundary(stem, Math.max(1, limit - 8))}_${Date.now()}`;
}

/** `drinking_water` → `drinkingWater`. */
export function camelize(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('');
}

/** Keep the author's spelling; only whitespace and punctuation become `_`. */
export function passthroughName(label: string, options: SlugifyOptions = {}): string {
  const maxLength = Math.max(1, options.maxLength ?? SLUG_MAX_LENGTH);
  const cleaned = (label ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]/gu, '');
  const value = cleaned === '' ? `opt_${Math.max(1, options.index ?? 1)}` : cleaned;
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

/** Style chosen in Preferences for brand-new lists. */
export function modeFromStyle(style: SlugStyle): ListMode {
  if (style === 'camel') return { kind: 'camel' };
  if (style === 'passthrough') return { kind: 'passthrough' };
  return { kind: 'snake' };
}

const NUMERIC = /^\d+$/;
const PREFIXED = /^([a-z][a-z0-9]*)_(\d+)$/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Infer the naming convention already used by a list (AD-14).
 *
 * `fallback` is returned only when the list has no names yet, so Preferences
 * can pick the convention for brand-new lists without overriding a detectable
 * one.
 */
export function detectListMode(
  names: readonly string[],
  fallback: ListMode = { kind: 'snake' },
): ListMode {
  const values = names.map((name) => name.trim()).filter(Boolean);
  if (values.length === 0) return fallback;
  if (values.every((name) => NUMERIC.test(name))) return { kind: 'numeric' };

  let prefix: string | undefined;
  const allPrefixed = values.every((name) => {
    const match = PREFIXED.exec(name);
    if (!match) return false;
    const candidate = match[1] ?? '';
    if (prefix === undefined) prefix = candidate;
    return prefix === candidate;
  });
  if (allPrefixed && prefix) return { kind: 'prefix', prefix };
  // camelCase is only unambiguous when at least one name has an uppercase
  // letter; single lowercase words stay snake_case.
  if (values.every((name) => CAMEL.test(name)) && values.some((name) => /[A-Z]/.test(name))) {
    return { kind: 'camel' };
  }
  return { kind: 'snake' };
}

/** The name the auto-fill engine would produce for a row in display order. */
export function autoChoiceName(
  label: string,
  mode: ListMode,
  position = 1,
  fallbackIndex = position,
  maxLength?: number,
): string {
  if (mode.kind === 'numeric') return numericName(position);
  if (mode.kind === 'prefix') return numericName(position, mode.prefix);
  const options: SlugifyOptions = { index: fallbackIndex };
  if (maxLength !== undefined) options.maxLength = maxLength;
  if (mode.kind === 'camel') return camelize(slugify(label, options));
  if (mode.kind === 'passthrough') return passthroughName(label, options);
  return slugify(label, options);
}

/**
 * A choice keeps its name when it was manually edited or imported with codes
 * that differ from the auto name (AD-14). `position` is 1-based within the list.
 */
export function inferNameLocked(row: Row, mode: ListMode, position = 1): boolean {
  const label = (row.cells.label ?? '').trim();
  const name = (row.cells.name ?? '').trim();
  if (label === '' && name === '') return false;
  const expected = autoChoiceName(label, mode, position, position);
  return name !== expected;
}

/**
 * AD-14 hook for the reader: infer `meta.nameLocked` per choice row from the
 * naming convention of its list. Mutates the freshly parsed sheet in place.
 */
export function inferNameLocks(choices: SheetData): void {
  const listKey = choices.columns.find((column) => resolveColumn(column).base === 'list_name');
  const nameKey = choices.columns.find((column) => resolveColumn(column).base === 'name');
  const labelKey = labelColumnFor(choices);
  if (!listKey || !nameKey) return;

  const byList = new Map<string, Row[]>();
  for (const row of choices.rows) {
    const listName = (row.cells[listKey] ?? '').trim();
    if (!listName) continue;
    const rows = byList.get(listName);
    if (rows) rows.push(row);
    else byList.set(listName, [row]);
  }

  for (const rows of byList.values()) {
    const mode = detectListMode(rows.map((row) => row.cells[nameKey] ?? ''));
    rows.forEach((row, index) => {
      const label = labelKey ? (row.cells[labelKey] ?? '') : '';
      const normalized: Row = {
        ...row,
        cells: { ...row.cells, label, name: row.cells[nameKey] ?? '' },
      };
      if (inferNameLocked(normalized, mode, index + 1)) {
        row.meta = { ...row.meta, nameLocked: true };
      } else if (row.meta?.nameLocked) {
        const meta = { ...row.meta };
        delete meta.nameLocked;
        row.meta = Object.keys(meta).length > 0 ? meta : undefined;
      }
    });
  }
}
