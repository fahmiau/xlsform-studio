/**
 * Variable rename refactoring (Task 5.1, PRD §4.5.1).
 *
 * Renaming a question rewrites only tokens that actually mean "this variable":
 * `${old}` in XPath columns and `${old}` interpolations in plain-text columns.
 * Names with regex metacharacters are safe because XPath replacement works on
 * tokenizer offsets (AD-9) and the plain-text path escapes its pattern.
 */
import { produce } from 'immer';

import { columnKey } from '../indexes/columns';
import { resolveColumn } from '../model/columns';
import type { ColumnKey, ManagedSheetName, RowId, WorkbookData } from '../model/types';
import { extractVarRefs } from '../xpath/tokenize';

export interface RefactorChange {
  sheet: ManagedSheetName;
  rowId: RowId;
  column: ColumnKey;
}

export interface RenameResult {
  data: WorkbookData;
  changes: RefactorChange[];
}

/** Plain-text columns whose `${…}` interpolations reference variables. */
const SURVEY_TEXT_BASES = new Set(['label', 'hint', 'constraint_message', 'required_message']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace `${old}` in XPath source, keeping whitespace inside `${  old  }`. */
export function replaceVarRefs(source: string, oldName: string, newName: string): string {
  const refs = extractVarRefs(source).filter((ref) => ref.closed && ref.name === oldName);
  if (refs.length === 0) return source;

  let result = '';
  let cursor = 0;
  for (const ref of refs) {
    result += source.slice(cursor, ref.innerFrom);
    const inner = source.slice(ref.innerFrom, ref.innerTo);
    const leading = /^\s*/.exec(inner)?.[0] ?? '';
    const trailing = /\s*$/.exec(inner)?.[0] ?? '';
    result += `${leading}${newName}${trailing}`;
    cursor = ref.innerTo;
  }
  return result + source.slice(cursor);
}

/** Replace `${old}` in prose; `${old_var_2}` is not affected. */
export function replaceInterpolations(source: string, oldName: string, newName: string): string {
  if (!source.includes('${')) return source;
  const pattern = new RegExp(`\\$\\{\\s*${escapeRegExp(oldName)}\\s*\\}`, 'g');
  return source.replace(pattern, `\${${newName}}`);
}

/** `trigger` holds space-separated variable names, not XPath references. */
export function replaceTriggerTokens(source: string, oldName: string, newName: string): string {
  if (!source.includes(oldName)) return source;
  return source
    .split(/(\s+)/)
    .map((token) => (token === oldName ? newName : token))
    .join('');
}

/** How many survey rows use `name` (duplicates are ambiguous, Task 5.1). */
export function countVariableUses(data: WorkbookData, name: string): number {
  const nameKey = columnKey(data.survey, 'name');
  return data.survey.rows.filter((row) => (row.cells[nameKey] ?? '').trim() === name).length;
}

interface TargetOptions {
  bases?: ReadonlySet<string>;
}

function columnsToRewrite(columns: readonly ColumnKey[], options: TargetOptions): ColumnKey[] {
  return columns.filter((column) => {
    const resolved = resolveColumn(column);
    if (resolved.isXPath) return true;
    if (options.bases) return options.bases.has(resolved.base);
    return false;
  });
}

function applyToSheet(
  sheet: WorkbookData[ManagedSheetName],
  sheetName: ManagedSheetName,
  oldName: string,
  newName: string,
  options: TargetOptions,
  changes: RefactorChange[],
): void {
  const columns = columnsToRewrite(sheet.columns, options);
  if (columns.length === 0) return;
  for (const row of sheet.rows) {
    for (const column of columns) {
      const value = row.cells[column] ?? '';
      if (!value) continue;
      const next = resolveColumn(column).isXPath
        ? resolveColumn(column).base === 'trigger'
          ? replaceTriggerTokens(value, oldName, newName)
          : replaceVarRefs(value, oldName, newName)
        : replaceInterpolations(value, oldName, newName);
      if (next === value) continue;
      row.cells[column] = next;
      changes.push({ sheet: sheetName, rowId: row.id, column });
    }
  }
}

export function renameVariable(data: WorkbookData, oldName: string, newName: string): RenameResult {
  const oldTrimmed = oldName.trim();
  const newTrimmed = newName.trim();
  if (!oldTrimmed || !newTrimmed || oldTrimmed === newTrimmed) {
    return { data, changes: [] };
  }

  const changes: RefactorChange[] = [];
  const next = produce(data, (draft) => {
    applyToSheet(
      draft.survey,
      'survey',
      oldTrimmed,
      newTrimmed,
      { bases: SURVEY_TEXT_BASES },
      changes,
    );
    applyToSheet(
      draft.choices,
      'choices',
      oldTrimmed,
      newTrimmed,
      { bases: new Set(['label']) },
      changes,
    );
    // `instance_name` is the only settings value that can reference variables.
    const instanceKey = draft.settings.columns.find(
      (column) => resolveColumn(column).base === 'instance_name',
    );
    if (instanceKey) {
      for (const row of draft.settings.rows) {
        const value = row.cells[instanceKey] ?? '';
        const updated = replaceInterpolations(value, oldTrimmed, newTrimmed);
        if (updated === value) continue;
        row.cells[instanceKey] = updated;
        changes.push({ sheet: 'settings', rowId: row.id, column: instanceKey });
      }
    }
  });

  return changes.length === 0 ? { data, changes } : { data: next, changes };
}
