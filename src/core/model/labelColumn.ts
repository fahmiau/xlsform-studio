/**
 * Pick the label column for a default language (used by the variable index,
 * the group tree, and XLS-010). One implementation keeps "which label is the
 * primary one" consistent across the app.
 */
import { resolveColumn } from './columns';
import type { ColumnKey, SheetData } from './types';

function languageMatches(header: ColumnKey, preferred: string): boolean {
  const language = resolveColumn(header).language;
  if (!language) return false;
  const normalized = preferred.trim().toLowerCase();
  if (!normalized) return false;
  if (language.code?.toLowerCase() === normalized) return true;
  if (language.name.toLowerCase() === normalized) return true;
  // `default_language` is commonly `English (en)`.
  const parenthetical = /\(([^()]*)\)\s*$/.exec(preferred);
  const code = parenthetical?.[1]?.trim().toLowerCase();
  return code !== undefined && code !== '' && language.code?.toLowerCase() === code;
}

export function defaultLabelColumn(
  sheet: SheetData,
  defaultLanguage?: string,
): ColumnKey | undefined {
  const labelColumns = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
  if (labelColumns.length === 0) return undefined;

  const preferred = defaultLanguage?.trim();
  if (preferred) {
    const localized = labelColumns.find((column) => languageMatches(column, preferred));
    if (localized) return localized;
  }

  return labelColumns.find((column) => !resolveColumn(column).language) ?? labelColumns[0];
}
