/**
 * List rename refactoring (Task 5.2, PRD §4.5.2).
 *
 * Rewrites the `list_name` cells of a choice list and the list token of every
 * `type` cell that points at it, keeping `or_other`, `from` spellings, and the
 * original command text. Nothing else is touched.
 */
import { produce } from 'immer';

import { columnKey } from '../indexes/columns';
import { parseType } from '../model/parseType';
import type { WorkbookData } from '../model/types';
import type { RefactorChange, RenameResult } from './renameVariable';

const XML_NAME = /^[A-Za-z_][A-Za-z0-9._-]*$/;

/** XLSForm list names must be valid XML names (pyxform rejects the rest). */
export function isValidListName(name: string): boolean {
  return XML_NAME.test(name.trim());
}

function listNames(data: WorkbookData): Set<string> {
  const listKey = columnKey(data.choices, 'list_name');
  const names = new Set<string>();
  for (const row of data.choices.rows) {
    const name = (row.cells[listKey] ?? '').trim();
    if (name) names.add(name);
  }
  return names;
}

/** Why a rename is refused, or `null` when it can proceed. */
export function listRenameError(
  data: WorkbookData,
  oldListName: string,
  newListName: string,
): string | null {
  const next = newListName.trim();
  if (!next) return 'List name cannot be empty';
  if (!isValidListName(next)) return `"${next}" is not a valid list name`;
  if (next === oldListName) return null;
  if (listNames(data).has(next)) return `A list named "${next}" already exists`;
  return null;
}

/** Replace the list-name token, preserving the rest of the type cell verbatim. */
export function replaceListToken(raw: string, oldListName: string, newListName: string): string {
  return raw
    .split(/(\s+)/)
    .map((token) => (token === oldListName ? newListName : token))
    .join('');
}

export function renameList(
  data: WorkbookData,
  oldListName: string,
  newListName: string,
): RenameResult {
  const oldName = oldListName.trim();
  const newName = newListName.trim();
  if (!oldName || !newName || oldName === newName) return { data, changes: [] };
  if (listRenameError(data, oldName, newName) !== null) return { data, changes: [] };

  const listKey = columnKey(data.choices, 'list_name');
  const typeKey = columnKey(data.survey, 'type');
  const changes: RefactorChange[] = [];

  const next = produce(data, (draft) => {
    for (const row of draft.choices.rows) {
      if ((row.cells[listKey] ?? '').trim() !== oldName) continue;
      row.cells[listKey] = newName;
      changes.push({ sheet: 'choices', rowId: row.id, column: listKey });
    }

    for (const row of draft.survey.rows) {
      const raw = row.cells[typeKey] ?? '';
      if (parseType(raw).listName !== oldName) continue;
      const updated = replaceListToken(raw, oldName, newName);
      if (updated === raw) continue;
      row.cells[typeKey] = updated;
      changes.push({ sheet: 'survey', rowId: row.id, column: typeKey });
    }
  });

  return changes.length === 0 ? { data, changes } : { data: next, changes };
}
