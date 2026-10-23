/**
 * Language discovery and primary-label resolution (Task 5.3, PRD §4.6).
 *
 * Headers stay verbatim (AD-5); this module groups the localized columns into
 * languages. It is the single answer to "which label is the primary one" used
 * by the indexes, the grid, XLS-010, the drawer, and completions.
 */
import { resolveColumn, type LanguageTag } from '../model/columns';
import { readSettings } from '../model/settings';
import type { ColumnKey, SheetData, WorkbookData } from '../model/types';

export const DEFAULT_LANGUAGE_NAME = 'Default';
export const DEFAULT_LANGUAGE_ID = DEFAULT_LANGUAGE_NAME;

export interface LanguageColumns {
  survey: ColumnKey[];
  choices: ColumnKey[];
}

export interface Language {
  /** Stable identifier (also the header suffix without the `(code)`). */
  id: string;
  name: string;
  code?: string;
  /** Human-facing `Name (code)` or `Name`. */
  display: string;
  columns: LanguageColumns;
}

/** `Indonesian (id)` for a tag, or `Indonesian` when the code is missing. */
export function formatLanguageTag(tag: LanguageTag): string {
  return tag.code ? `${tag.name} (${tag.code})` : tag.name;
}

function emptyColumns(): LanguageColumns {
  return { survey: [], choices: [] };
}

function displayName(name: string, code: string | undefined): string {
  return code ? `${name} (${code})` : name;
}

function addColumn(
  map: Map<string, Language>,
  order: string[],
  sheet: 'survey' | 'choices',
  column: ColumnKey,
  tag: LanguageTag | undefined,
): void {
  if (!tag) {
    // Unsuffixed localizable columns form the "Default" pseudo-language.
    let entry = map.get(DEFAULT_LANGUAGE_ID);
    if (!entry) {
      entry = {
        id: DEFAULT_LANGUAGE_ID,
        name: DEFAULT_LANGUAGE_NAME,
        display: DEFAULT_LANGUAGE_NAME,
        columns: emptyColumns(),
      };
      map.set(entry.id, entry);
      order.push(entry.id);
    }
    entry.columns[sheet].push(column);
    return;
  }

  const key = tag.name.trim().toLowerCase();
  let entry = map.get(key);
  if (!entry) {
    entry = {
      id: displayName(tag.name, tag.code),
      name: tag.name,
      columns: emptyColumns(),
      display: displayName(tag.name, tag.code),
    };
    if (tag.code) entry.code = tag.code;
    entry.columns[sheet].push(column);
    map.set(key, entry);
    order.push(key);
    return;
  }
  entry.columns[sheet].push(column);
  // A later header may carry the code the first one omitted.
  if (!entry.code && tag.code) {
    entry.code = tag.code;
    entry.id = displayName(entry.name, tag.code);
    entry.display = entry.id;
  }
}

/** Discovered languages in first-seen header order. */
export function discoverLanguages(data: WorkbookData): Language[] {
  const map = new Map<string, Language>();
  const order: string[] = [];

  for (const sheet of ['survey', 'choices'] as const) {
    for (const column of data[sheet].columns) {
      const resolved = resolveColumn(column);
      if (!resolved.isLocalizable) continue;
      addColumn(map, order, sheet, column, resolved.language);
    }
  }

  return order
    .map((key) => map.get(key))
    .filter((language): language is Language => language !== undefined);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Match by display (`Name (code)`), name, code, or id. */
export function findLanguage(
  languages: readonly Language[],
  identifier: string | null | undefined,
): Language | undefined {
  if (!identifier) return undefined;
  const needle = normalize(identifier);
  if (!needle) return undefined;
  const namePart = normalize(identifier.replace(/\s*\([^()]*\)\s*$/, ''));
  return languages.find((language) => {
    if (normalize(language.id) === needle) return true;
    if (normalize(language.display) === needle) return true;
    if (normalize(language.name) === needle) return true;
    if (namePart !== '' && normalize(language.name) === namePart) return true;
    if (language.code && normalize(language.code) === needle) return true;
    return false;
  });
}

/**
 * The form's primary language: `settings.default_language` when it matches,
 * else the unsuffixed "Default" language, else the first discovered one.
 */
export function defaultLanguage(data: WorkbookData): Language | undefined {
  const languages = discoverLanguages(data);
  if (languages.length === 0) return undefined;
  const configured = readSettings(data.settings).defaultLanguage;
  const matched = findLanguage(languages, configured);
  if (matched) return matched;
  const fallback = languages.find((language) => language.id === DEFAULT_LANGUAGE_ID);
  return fallback ?? languages[0];
}

/**
 * The label column for `identifier` on one sheet. Unsuffixed is the fallback
 * when the requested language is not present, matching pre-5.3 behavior.
 */
export function labelColumnFor(
  sheet: SheetData,
  identifier?: string | null,
): ColumnKey | undefined {
  const labelColumns = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
  if (labelColumns.length === 0) return undefined;
  if (identifier) {
    const exact = labelColumns.find((column) => columnLanguageMatches(column, identifier));
    if (exact) return exact;
  }
  return labelColumns.find((column) => !resolveColumn(column).language) ?? labelColumns[0];
}

function columnLanguageMatches(column: ColumnKey, identifier: string): boolean {
  const tag = resolveColumn(column).language;
  if (!tag) return normalize(identifier) === normalize(DEFAULT_LANGUAGE_NAME);
  const parenthetical = /\(([^()]*)\)\s*$/.exec(identifier);
  const code = normalize(parenthetical?.[1] ?? '');
  return (
    normalize(formatLanguageTag(tag)) === normalize(identifier) ||
    normalize(tag.name) === normalize(identifier) ||
    (tag.code !== undefined && normalize(tag.code) === normalize(identifier)) ||
    (code !== '' && tag.code !== undefined && normalize(tag.code) === code)
  );
}

/** Single shared resolver for the primary label column of `survey` or `choices`. */
export function primaryLabelColumn(sheet: SheetData, data: WorkbookData): ColumnKey | undefined {
  return labelColumnFor(sheet, defaultLanguage(data)?.id);
}
