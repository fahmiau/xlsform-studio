/** XLS-006 Missing or empty choice list (PRD §4.5). */
import { parseType } from '../../model/parseType';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor } from './helpers';

const LIST_BASES = new Set(['select_one', 'select_multiple', 'rank']);

export const xls006: LintRule = {
  id: 'XLS-006',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const typeKey = columnFor(survey, 'type');
    const issues: DiagnosticIssue[] = [];

    for (const row of survey.rows) {
      const text = cell(row, typeKey);
      const parsed = parseType(text);
      if (!LIST_BASES.has(parsed.base)) continue;

      if (!parsed.listName) {
        issues.push({
          ruleId: 'XLS-006',
          severity: 'error',
          sheet: 'survey',
          rowId: row.id,
          ...(typeKey ? { column: typeKey } : {}),
          message: `${parsed.base} is missing a list_name`,
        });
        continue;
      }
      if ((ctx.indexes.choices.byList[parsed.listName]?.length ?? 0) > 0) continue;

      const from = Math.max(0, text.indexOf(parsed.listName));
      issues.push({
        ruleId: 'XLS-006',
        severity: 'error',
        sheet: 'survey',
        rowId: row.id,
        ...(typeKey ? { column: typeKey } : {}),
        range: { from, to: from + parsed.listName.length },
        message: `Choice list "${parsed.listName}" has no rows in the choices sheet`,
        data: { listName: parsed.listName },
      });
    }

    return issues;
  },
};
