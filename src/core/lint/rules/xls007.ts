/** XLS-007 Duplicate choice name within a list (PRD §4.5). */
import type { Row } from '../../model/types';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { columnFor } from './helpers';

interface Choice {
  row: Row;
  rowIndex: number;
  listName: string;
  name: string;
}

export const xls007: LintRule = {
  id: 'XLS-007',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    if (ctx.settings.allowChoiceDuplicates) return [];
    const choices = ctx.data.choices;
    const listKey = columnFor(choices, 'list_name');
    const nameKey = columnFor(choices, 'name');
    const firstByKey = new Map<string, Choice>();
    const duplicates = new Map<string, Choice[]>();

    choices.rows.forEach((row, rowIndex) => {
      const listName = (listKey ? (row.cells[listKey] ?? '') : '').trim();
      const name = (nameKey ? (row.cells[nameKey] ?? '') : '').trim();
      if (!listName || !name) return;
      const key = `${listName}\u0000${name}`;
      const entry: Choice = { row, rowIndex, listName, name };
      const first = firstByKey.get(key);
      if (!first) {
        firstByKey.set(key, entry);
        return;
      }
      const bucket = duplicates.get(key);
      if (bucket) bucket.push(entry);
      else duplicates.set(key, [first, entry]);
    });

    const issues: DiagnosticIssue[] = [];
    for (const entries of duplicates.values()) {
      for (const entry of entries) {
        const others = entries.filter((candidate) => candidate !== entry);
        issues.push({
          ruleId: 'XLS-007',
          severity: 'error',
          sheet: 'choices',
          rowId: entry.row.id,
          ...(nameKey ? { column: nameKey } : {}),
          message: `Duplicate choice name "${entry.name}" in list "${entry.listName}" (also on ${others
            .map((other) => `row ${other.rowIndex + 1}`)
            .join(', ')})`,
          data: {
            listName: entry.listName,
            relatedRowIds: others.map((other) => other.row.id),
          },
        });
      }
    }
    return issues;
  },
};
