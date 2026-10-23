/**
 * Choice value rename refactoring (Task 5.2, PRD §4.5.3, Q6).
 *
 * Only string literals that name a choice of the renamed list are rewritten:
 * `selected(${q}, 'old')`, `${q} = 'old'`, `${q} != 'old'`, and swapped
 * comparisons. The structural scan comes from `xpath/context` (AD-9), so lint
 * rule XLS-011 and this refactor agree on what a choice literal is.
 */
import { produce } from 'immer';

import { columnKey } from '../indexes/columns';
import { resolveColumn } from '../model/columns';
import { parseType } from '../model/parseType';
import type { ColumnKey, WorkbookData } from '../model/types';
import { findChoiceValueReferences } from '../xpath/context';
import { tokenize } from '../xpath/tokenize';
import type { RefactorChange, RenameResult } from './renameVariable';

function boundVariableNames(data: WorkbookData, listName: string): Set<string> {
  const typeKey = columnKey(data.survey, 'type');
  const nameKey = columnKey(data.survey, 'name');
  const names = new Set<string>();
  for (const row of data.survey.rows) {
    if (parseType(row.cells[typeKey] ?? '').listName !== listName) continue;
    const name = (row.cells[nameKey] ?? '').trim();
    if (name) names.add(name);
  }
  return names;
}

function replaceChoiceLiterals(
  source: string,
  variables: ReadonlySet<string>,
  oldValue: string,
  newValue: string,
): string {
  const references = findChoiceValueReferences(tokenize(source)).filter(
    (reference) => variables.has(reference.varName) && reference.value === oldValue,
  );
  if (references.length === 0) return source;

  let result = source;
  // Replace back to front so earlier offsets stay valid.
  for (let index = references.length - 1; index >= 0; index -= 1) {
    const reference = references[index];
    if (!reference) continue;
    result = `${result.slice(0, reference.from)}${newValue}${result.slice(reference.to)}`;
  }
  return result;
}

function replaceDefaultTokens(source: string, oldValue: string, newValue: string): string {
  const tokens = source.split(/(\s+)/);
  let changed = false;
  const next = tokens.map((token) => {
    if (token !== oldValue) return token;
    changed = true;
    return newValue;
  });
  return changed ? next.join('') : source;
}

export function renameChoiceValue(
  data: WorkbookData,
  listName: string,
  oldValue: string,
  newValue: string,
): RenameResult {
  const oldName = oldValue.trim();
  const newName = newValue.trim();
  const list = listName.trim();
  if (!list || !oldName || !newName || oldName === newName) return { data, changes: [] };

  const variables = boundVariableNames(data, list);
  if (variables.size === 0) return { data, changes: [] };

  const changes: RefactorChange[] = [];
  const nameKey = columnKey(data.survey, 'name');
  const defaultKey = data.survey.columns.find((column) => resolveColumn(column).base === 'default');

  const next = produce(data, (draft) => {
    for (const row of draft.survey.rows) {
      const name = (row.cells[nameKey] ?? '').trim();
      if (!variables.has(name)) continue;

      for (const column of draft.survey.columns) {
        if (!resolveColumn(column).isXPath) continue;
        const value = row.cells[column] ?? '';
        if (!value.includes(oldName)) continue;
        const updated =
          column === defaultKey
            ? replaceDefaultTokens(value, oldName, newName)
            : replaceChoiceLiterals(value, variables, oldName, newName);
        if (updated === value) continue;
        row.cells[column] = updated;
        changes.push({ sheet: 'survey', rowId: row.id, column });
      }
    }
  });

  return changes.length === 0 ? { data, changes } : { data: next, changes };
}

export interface ChoiceNameChange {
  rowId: string;
  listName: string;
  from: string;
  to: string;
}

/**
 * Names that changed between two snapshots, where the old value was unique in
 * its list and the new value does not already exist there.
 */
export function changedChoiceNames(before: WorkbookData, after: WorkbookData): ChoiceNameChange[] {
  const listKey: ColumnKey = columnKey(before.choices, 'list_name');
  const nameKey: ColumnKey = columnKey(before.choices, 'name');
  const beforeRows = new Map(before.choices.rows.map((row) => [row.id, row]));

  const byList = new Map<string, number>();
  for (const row of before.choices.rows) {
    const list = (row.cells[listKey] ?? '').trim();
    const name = (row.cells[nameKey] ?? '').trim();
    if (!list || !name) continue;
    byList.set(`${list}\u0000${name}`, (byList.get(`${list}\u0000${name}`) ?? 0) + 1);
  }

  const changed: ChoiceNameChange[] = [];
  for (const row of after.choices.rows) {
    const previous = beforeRows.get(row.id);
    if (!previous) continue;
    const listName = (previous.cells[listKey] ?? '').trim();
    const from = (previous.cells[nameKey] ?? '').trim();
    const to = (row.cells[nameKey] ?? '').trim();
    if (!listName || !from || !to || from === to) continue;
    if (byList.get(`${listName}\u0000${from}`) !== 1) continue;
    // Do not fold two distinct choices into the same code.
    if (byList.has(`${listName}\u0000${to}`)) continue;
    changed.push({ rowId: row.id, listName, from, to });
  }
  return changed;
}

/** Propagate every changed choice name through `renameChoiceValue` (5.2). */
export function propagateChoiceRenames(before: WorkbookData, after: WorkbookData): RenameResult {
  const changes: RefactorChange[] = [];
  let data = after;
  for (const change of changedChoiceNames(before, after)) {
    const result = renameChoiceValue(data, change.listName, change.from, change.to);
    data = result.data;
    changes.push(...result.changes);
  }
  return { data, changes };
}
