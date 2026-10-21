/**
 * Choice-list index and list usage (Task 1.7). `listUsage` drives the shared
 * list banner in the Choices Drawer (PRD §4.3).
 */
import { parseType } from '../model/parseType';
import type { Row, RowId, SheetData } from '../model/types';

export interface ChoicesIndex {
  byList: Record<string, Row[]>;
  /** Survey row ids that reference each list name. */
  listUsage: Record<string, RowId[]>;
}

export function buildChoicesByList(choices: SheetData, survey?: SheetData): ChoicesIndex {
  const byList: Record<string, Row[]> = {};
  for (const row of choices.rows) {
    const listName = (row.cells.list_name ?? '').trim();
    if (!listName) continue;
    (byList[listName] ??= []).push(row);
  }

  const listUsage: Record<string, RowId[]> = {};
  if (survey) {
    for (const row of survey.rows) {
      const { listName } = parseType(row.cells.type ?? '');
      if (!listName) continue;
      (listUsage[listName] ??= []).push(row.id);
    }
  }

  return { byList, listUsage };
}
