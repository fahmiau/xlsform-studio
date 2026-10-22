/** XLS-001 Missing or invalid survey name (PRD §4.5). */
import { parseType } from '../../model/parseType';
import { getQuestionType } from '../../model/questionTypes';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor, rowNumber } from './helpers';

const NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const INVALID_START = /^[0-9.-]/;

export const xls001: LintRule = {
  id: 'XLS-001',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const typeKey = columnFor(survey, 'type');
    const nameKey = columnFor(survey, 'name');
    const issues: DiagnosticIssue[] = [];

    survey.rows.forEach((row, rowIndex) => {
      const parsed = parseType(cell(row, typeKey));
      const question = getQuestionType(parsed.base);
      if (!question?.requiresName) return;

      const name = cell(row, nameKey).trim();
      let message: string | undefined;
      if (!name) {
        message = `Row ${rowNumber(rowIndex)} is missing a name`;
      } else if (INVALID_START.test(name)) {
        message = `Name "${name}" must not start with a digit, hyphen, or period`;
      } else if (!NAME_PATTERN.test(name)) {
        message = `Name "${name}" contains characters outside [a-zA-Z0-9_.-]`;
      }
      if (!message) return;

      issues.push({
        ruleId: 'XLS-001',
        severity: 'error',
        sheet: 'survey',
        rowId: row.id,
        ...(nameKey ? { column: nameKey } : {}),
        message,
      });
    });

    return issues;
  },
};
