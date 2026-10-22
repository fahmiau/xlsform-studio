/** XLS-010 Missing label in the default language (warning, PRD §4.5). */
import { defaultLabelColumn } from '../../model/labelColumn';
import { parseType } from '../../model/parseType';
import { getQuestionType } from '../../model/questionTypes';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor } from './helpers';

/** Types that never need a respondent-visible label. */
const EXEMPT = new Set([
  'calculate',
  'hidden',
  'start',
  'end',
  'today',
  'deviceid',
  'username',
  'phonenumber',
  'email',
  'audit',
  'end_group',
  'end_repeat',
]);

export const xls010: LintRule = {
  id: 'XLS-010',
  severity: 'warning',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const typeKey = columnFor(survey, 'type');
    const nameKey = columnFor(survey, 'name');
    const labelKey = defaultLabelColumn(survey, ctx.settings.defaultLanguage);
    // A sheet with no label column at all is not a form of visible questions;
    // do not flood it with one warning per row.
    if (!labelKey) return [];
    const issues: DiagnosticIssue[] = [];

    for (const row of survey.rows) {
      // Most rows have a label; skip parsing the type until a warning is possible.
      if (cell(row, labelKey).trim()) continue;
      const base = parseType(cell(row, typeKey)).base;
      const question = getQuestionType(base);
      if (!base || !question || !question.isVisible || EXEMPT.has(base)) continue;
      issues.push({
        ruleId: 'XLS-010',
        severity: 'warning',
        sheet: 'survey',
        rowId: row.id,
        ...(labelKey ? { column: labelKey } : {}),
        message: `Question "${cell(row, nameKey).trim() || base}" has no label in the default language`,
      });
    }
    return issues;
  },
};
