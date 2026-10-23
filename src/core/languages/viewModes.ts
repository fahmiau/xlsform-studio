/**
 * Language view modes (Task 5.4, PRD §4.6). Display-only: export always writes
 * every column, and changing the mode never mutates `WorkbookData`.
 */
import { resolveColumn } from '../model/columns';
import type { ColumnKey, ManagedSheetName, SheetData } from '../model/types';
import { DEFAULT_LANGUAGE_ID, findLanguage, type Language } from './discover';

export type LanguageViewMode = 'all' | 'single' | 'split';

export interface LanguageViewState {
  mode: LanguageViewMode;
  /** Target language for `single` and the right-hand side of `split`. */
  language?: string | null;
  /** Source language (frozen side) in `split`. */
  source?: string | null;
  /** Target language in `split`. */
  target?: string | null;
}

export interface VisibleColumns {
  columns: ColumnKey[];
  /** Columns Glide should freeze (must be leftmost; display reorders them). */
  frozen: ColumnKey[];
}

const TRANSLATION_BASES = ['label', 'hint', 'constraint_message'] as const;

const FROZEN_PREFIX: Record<'survey' | 'choices', readonly string[]> = {
  survey: ['type', 'name'],
  choices: ['list_name', 'name'],
};

function isLocalized(column: ColumnKey): boolean {
  return resolveColumn(column).isLocalizable;
}

function firstColumn(sheetColumns: readonly ColumnKey[], base: string): ColumnKey | undefined {
  return sheetColumns.find((column) => resolveColumn(column).base === base);
}

function relativeTranslationColumns(
  sheetColumns: readonly ColumnKey[],
  candidates: readonly ColumnKey[],
): ColumnKey[] {
  return TRANSLATION_BASES.flatMap((base) => {
    const key = candidates.find(
      (column) => sheetColumns.includes(column) && resolveColumn(column).base === base,
    );
    return key ? [key] : [];
  });
}

function dedupe(columns: readonly ColumnKey[]): ColumnKey[] {
  return [...new Set(columns)];
}

function defaultFrozen(
  sheet: ManagedSheetName,
  sheetColumns: readonly ColumnKey[],
  primaryLabel: ColumnKey | undefined,
): ColumnKey[] {
  if (sheet === 'settings') return [];
  const frozen: ColumnKey[] = [];
  for (const base of FROZEN_PREFIX[sheet]) {
    const key = firstColumn(sheetColumns, base);
    if (key) frozen.push(key);
  }
  const label = primaryLabel ?? firstColumn(sheetColumns, 'label');
  if (label) frozen.push(label);
  return dedupe(frozen).filter((column) => sheetColumns.includes(column));
}

/** Source/target pair for the split view, with the selector defaults applied. */
export function splitPair(
  languages: readonly Language[],
  view: LanguageViewState,
): { source: Language | undefined; target: Language | undefined } {
  const source =
    findLanguage(languages, view.source) ??
    findLanguage(languages, DEFAULT_LANGUAGE_ID) ??
    languages[0];
  const target =
    findLanguage(languages, view.target) ??
    languages.find((language) => language.id !== source?.id) ??
    source;
  return { source, target };
}

/**
 * Compute the visible and frozen columns for a sheet.
 *
 * - `all`: every column, with the familiar type/name/label frozen set.
 * - `single`: non-localized columns plus the selected language's columns.
 * - `split`: type/name (or list_name/name), the source translation columns,
 *   then only the target translation columns.
 */
export function visibleColumns(
  sheet: ManagedSheetName,
  sheetColumns: readonly ColumnKey[],
  languages: readonly Language[],
  view: LanguageViewState,
): VisibleColumns {
  if (sheet === 'settings' || view.mode === 'all' || languages.length === 0) {
    return {
      columns: [...sheetColumns],
      frozen: defaultFrozen(sheet, sheetColumns, undefined),
    };
  }

  const sheetKey = sheet === 'choices' ? 'choices' : 'survey';

  if (view.mode === 'single') {
    const language =
      findLanguage(languages, view.language) ??
      findLanguage(languages, DEFAULT_LANGUAGE_ID) ??
      languages[0];
    const localized = new Set(language ? language.columns[sheetKey] : []);
    const columns = sheetColumns.filter((column) => !isLocalized(column) || localized.has(column));
    const label = language
      ? relativeTranslationColumns(sheetColumns, language.columns[sheetKey]).find(
          (column) => resolveColumn(column).base === 'label',
        )
      : undefined;
    return {
      columns,
      frozen: defaultFrozen(sheet, columns, label).filter((column) => columns.includes(column)),
    };
  }

  // Translation Split View.
  const { source, target } = splitPair(languages, view);

  const frozen: ColumnKey[] = [];
  for (const base of FROZEN_PREFIX[sheetKey]) {
    const key = firstColumn(sheetColumns, base);
    if (key) frozen.push(key);
  }
  frozen.push(...relativeTranslationColumns(sheetColumns, source ? source.columns[sheetKey] : []));

  const targetColumns =
    target && target.id !== source?.id
      ? relativeTranslationColumns(sheetColumns, target.columns[sheetKey])
      : [];
  const columns = dedupe([...frozen, ...targetColumns]);
  return { columns, frozen: dedupe(frozen).filter((column) => columns.includes(column)) };
}

export interface TranslationSummary {
  /** Cells where the source is filled and the target is empty (or missing). */
  count: number;
  /** `rowId\u0000targetColumn` keys for the grid tint. */
  keys: Set<string>;
}

/**
 * Count and locate untranslated cells for the split view. A missing target
 * column counts as untranslated but has no cell to tint.
 */
export function translationSummary(
  sheet: SheetData,
  languages: readonly Language[],
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
): TranslationSummary {
  const sheetKey = sheet.sheetName === 'choices' ? 'choices' : 'survey';
  const source = findLanguage(languages, sourceId);
  const target = findLanguage(languages, targetId);
  const keys = new Set<string>();
  let count = 0;
  if (!source) return { count, keys };

  for (const base of TRANSLATION_BASES) {
    const sourceColumn = source.columns[sheetKey].find(
      (column) => resolveColumn(column).base === base,
    );
    if (!sourceColumn) continue;
    const targetColumn = target?.columns[sheetKey].find(
      (column) => resolveColumn(column).base === base,
    );
    for (const row of sheet.rows) {
      if (!(row.cells[sourceColumn] ?? '').trim()) continue;
      if (targetColumn && (row.cells[targetColumn] ?? '').trim()) continue;
      count += 1;
      if (targetColumn) keys.add(`${row.id}\u0000${targetColumn}`);
    }
  }
  return { count, keys };
}

/** The translated cell keys only (the tint path in the grid). */
export function untranslatedCellKeys(
  sheet: SheetData,
  languages: readonly Language[],
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
): Set<string> {
  return translationSummary(sheet, languages, sourceId, targetId).keys;
}
