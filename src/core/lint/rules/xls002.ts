/** XLS-002 Duplicate survey name, exact (error) or case-only (warning). */
import type { Row } from '../../model/types';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor, rowNumber } from './helpers';

interface NamedRow {
  row: Row;
  rowIndex: number;
  name: string;
}

function collect(
  map: Map<string, NamedRow>,
  duplicates: Map<string, NamedRow[]>,
  key: string,
  entry: NamedRow,
): void {
  const first = map.get(key);
  if (!first) {
    map.set(key, entry);
    return;
  }
  const bucket = duplicates.get(key);
  if (bucket) bucket.push(entry);
  else duplicates.set(key, [first, entry]);
}

export const xls002: LintRule = {
  id: 'XLS-002',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const nameKey = columnFor(survey, 'name');
    const exactFirst = new Map<string, NamedRow>();
    const exactDuplicates = new Map<string, NamedRow[]>();
    const lowerFirst = new Map<string, NamedRow>();
    const lowerDuplicates = new Map<string, NamedRow[]>();

    survey.rows.forEach((row, rowIndex) => {
      const name = cell(row, nameKey).trim();
      if (!name) return;
      const entry: NamedRow = { row, rowIndex, name };
      collect(exactFirst, exactDuplicates, name, entry);
      collect(lowerFirst, lowerDuplicates, name.toLowerCase(), entry);
    });

    const issues: DiagnosticIssue[] = [];
    for (const entries of exactDuplicates.values()) {
      for (const entry of entries) {
        const others = entries.filter((candidate) => candidate !== entry);
        issues.push({
          ruleId: 'XLS-002',
          severity: 'error',
          sheet: 'survey',
          rowId: entry.row.id,
          ...(nameKey ? { column: nameKey } : {}),
          message: `Duplicate name "${entry.name}" (also on ${others
            .map((other) => `row ${rowNumber(other.rowIndex)}`)
            .join(', ')})`,
          data: { relatedRowIds: others.map((other) => other.row.id) },
        });
      }
    }

    for (const entries of lowerDuplicates.values()) {
      // Rows already reported as exact duplicates are not case-warnings too.
      // Filter by exact name (not by the lower-case key): two exact `age` rows
      // still leave an `AGE` row to warn about.
      const caseEntries = entries.filter((entry) => !exactDuplicates.has(entry.name));
      if (caseEntries.length === 0) continue;
      for (const entry of caseEntries) {
        const others = entries.filter((candidate) => candidate !== entry);
        issues.push({
          ruleId: 'XLS-002',
          severity: 'warning',
          sheet: 'survey',
          rowId: entry.row.id,
          ...(nameKey ? { column: nameKey } : {}),
          message: `Name "${entry.name}" differs only by case from ${others
            .map((other) => `"${other.name}" (row ${rowNumber(other.rowIndex)})`)
            .join(', ')}`,
          data: { relatedRowIds: others.map((other) => other.row.id) },
        });
      }
    }

    return issues;
  },
};
