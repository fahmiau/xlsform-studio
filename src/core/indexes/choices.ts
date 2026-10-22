/**
 * Choice-list index and list usage (Task 1.7). `listUsage` drives the shared
 * list banner in the Choices Drawer (PRD §4.3).
 */
import { parseType } from '../model/parseType';
import type { Row, RowId, SheetData } from '../model/types';
import { columnKey } from './columns';

export interface ChoicesIndex {
  byList: Record<string, Row[]>;
  /** Survey row ids that reference each list name. */
  listUsage: Record<string, RowId[]>;
}

export function buildChoicesByList(choices: SheetData, survey?: SheetData): ChoicesIndex {
  const byList: Record<string, Row[]> = {};
  const listNameKey = columnKey(choices, 'list_name');
  for (const row of choices.rows) {
    const listName = (row.cells[listNameKey] ?? '').trim();
    if (!listName) continue;
    (byList[listName] ??= []).push(row);
  }

  const listUsage: Record<string, RowId[]> = {};
  if (survey) {
    const typeKey = columnKey(survey, 'type');
    for (const row of survey.rows) {
      const { listName } = parseType(row.cells[typeKey] ?? '');
      if (!listName) continue;
      (listUsage[listName] ??= []).push(row.id);
    }
  }

  return { byList, listUsage };
}
