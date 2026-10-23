/**
 * Add a language to a workbook (Task 5.5). Pure `(data, options) => data`: the
 * caller wraps it in one `workbookStore.apply` so the whole column set is one
 * undo step.
 */
import { produce } from 'immer';

import { discoverLanguages, findLanguage } from '../languages/discover';
import { localizedHeader, resolveColumn, type ColumnBase } from '../model/columns';
import type { ColumnKey, WorkbookData } from '../model/types';
import { renameColumn } from './columns';

const SURVEY_BASES: readonly ColumnBase[] = ['label', 'hint', 'constraint_message'];

export interface AddLanguageOptions {
  name: string;
  code?: string;
  /** Rename the unsuffixed columns instead of creating parallel ones. */
  convertDefault?: boolean;
}

export interface LanguageColumnChange {
  sheet: 'survey' | 'choices';
  column: ColumnKey;
  /** Original unsuffixed header for converted columns. */
  from?: ColumnKey;
}

export interface AddLanguageResult {
  data: WorkbookData;
  added: LanguageColumnChange[];
  renamed: LanguageColumnChange[];
}

function lastLocalizedIndex(columns: readonly ColumnKey[], base: ColumnBase): number {
  let at = -1;
  columns.forEach((column, index) => {
    const resolved = resolveColumn(column);
    if (resolved.base === base && resolved.isLocalizable) at = index;
  });
  return at;
}

function unsuffixedColumn(columns: readonly ColumnKey[], base: ColumnBase): ColumnKey | undefined {
  return columns.find((column) => {
    const resolved = resolveColumn(column);
    return resolved.base === base && resolved.language === undefined;
  });
}

/**
 * Insert a header after the last localizable column of the same base (or at
 * the end when the sheet has none).
 */
function insertAfterBase(columns: ColumnKey[], header: ColumnKey, base: ColumnBase): ColumnKey[] {
  if (columns.includes(header)) return columns;
  const next = [...columns];
  const at = lastLocalizedIndex(next, base);
  next.splice(at >= 0 ? at + 1 : next.length, 0, header);
  return next;
}

export function addLanguage(data: WorkbookData, options: AddLanguageOptions): AddLanguageResult {
  const name = options.name.trim();
  const code = options.code?.trim() || undefined;
  if (!name) throw new Error('Language name is required');
  if (name.toLowerCase() === 'default') {
    throw new Error('"Default" is reserved for unsuffixed columns');
  }

  const existing = discoverLanguages(data);
  const duplicate =
    findLanguage(existing, name) ?? (code ? findLanguage(existing, code) : undefined);
  if (duplicate) {
    throw new Error(`Language "${code ? `${name} (${code})` : name}" already exists`);
  }

  const tag = code ? { name, code } : { name };
  const added: LanguageColumnChange[] = [];
  const renamed: LanguageColumnChange[] = [];
  let next = data;

  const plan: Array<{ sheet: 'survey' | 'choices'; base: ColumnBase }> = [
    ...SURVEY_BASES.map((base) => ({ sheet: 'survey' as const, base })),
    { sheet: 'choices' as const, base: 'label' as const },
  ];

  for (const { sheet, base } of plan) {
    const header = localizedHeader(base, tag);
    const source = unsuffixedColumn(next[sheet].columns, base);
    if (options.convertDefault && source) {
      next = renameColumn(next, sheet, source, header);
      renamed.push({ sheet, column: header, from: source });
      continue;
    }
    const columns = next[sheet].columns;
    if (columns.includes(header)) continue;
    const updated = insertAfterBase(columns, header, base);
    next = produce(next, (draft) => {
      draft[sheet].columns = updated;
    });
    added.push({ sheet, column: header });
  }

  return { data: next, added, renamed };
}
