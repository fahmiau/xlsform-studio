/** XLS-009 Calculate row with an empty calculation (PRD §4.5). */
import { parseType } from '../../model/parseType';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor } from './helpers';

export const xls009: LintRule = {
  id: 'XLS-009',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const typeKey = columnFor(survey, 'type');
    const calculationKey = columnFor(survey, 'calculation');
    const issues: DiagnosticIssue[] = [];

    for (const row of survey.rows) {
      if (parseType(cell(row, typeKey)).base !== 'calculate') continue;
      if (cell(row, calculationKey).trim()) continue;
      issues.push({
        ruleId: 'XLS-009',
        severity: 'error',
        sheet: 'survey',
        rowId: row.id,
        ...(calculationKey ? { column: calculationKey } : {}),
        message: 'calculate row has an empty calculation',
      });
    }
    return issues;
  },
};
