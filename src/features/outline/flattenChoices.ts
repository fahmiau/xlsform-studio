/** Flat choice-list rows for the Outline panel on the choices sheet (C3). */
import type { Row, RowId } from '@/core/model/types';

export interface ChoiceListItem {
  listName: string;
  /** First choice row in the list; the outline jumps here. */
  rowId: RowId;
  count: number;
}

export function flattenChoices(byList: Record<string, Row[]>, filter = ''): ChoiceListItem[] {
  const term = filter.trim().toLowerCase();
  const items: ChoiceListItem[] = [];
  for (const [listName, rows] of Object.entries(byList)) {
    if (!listName) continue;
    const first = rows[0];
    if (!first) continue;
    if (term && !listName.toLowerCase().includes(term)) continue;
    items.push({ listName, rowId: first.id, count: rows.length });
  }
  return items;
}
