/** XLS-003 Unbalanced group/repeat tags (PRD §4.5). */
import { parseType } from '../../model/parseType';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor, rowNumber } from './helpers';

interface OpenGroup {
  rowId: string;
  rowIndex: number;
  name: string;
  kind: 'group' | 'repeat';
}

export const xls003: LintRule = {
  id: 'XLS-003',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const survey = ctx.data.survey;
    const typeKey = columnFor(survey, 'type');
    const nameKey = columnFor(survey, 'name');
    const stack: OpenGroup[] = [];
    const issues: DiagnosticIssue[] = [];

    survey.rows.forEach((row, rowIndex) => {
      const parsed = parseType(cell(row, typeKey));
      const base = parsed.base;
      if (base === 'begin_group' || base === 'begin_repeat') {
        stack.push({
          rowId: row.id,
          rowIndex,
          name: cell(row, nameKey).trim(),
          kind: base === 'begin_repeat' ? 'repeat' : 'group',
        });
        return;
      }
      if (base !== 'end_group' && base !== 'end_repeat') return;

      const expected = base === 'end_repeat' ? 'repeat' : 'group';
      const top = stack[stack.length - 1];
      if (!top) {
        issues.push({
          ruleId: 'XLS-003',
          severity: 'error',
          sheet: 'survey',
          rowId: row.id,
          ...(typeKey ? { column: typeKey } : {}),
          message: `${base} has no matching ${expected === 'repeat' ? 'begin_repeat' : 'begin_group'}`,
        });
        return;
      }
      if (top.kind !== expected) {
        issues.push({
          ruleId: 'XLS-003',
          severity: 'error',
          sheet: 'survey',
          rowId: row.id,
          ...(typeKey ? { column: typeKey } : {}),
          message: `${base} does not match begin_${top.kind}${top.name ? ` "${top.name}"` : ''} on row ${rowNumber(top.rowIndex)}`,
          data: { beginRowId: top.rowId },
        });
        return;
      }
      stack.pop();
    });

    for (const open of stack) {
      issues.push({
        ruleId: 'XLS-003',
        severity: 'error',
        sheet: 'survey',
        rowId: open.rowId,
        ...(typeKey ? { column: typeKey } : {}),
        message: `begin_${open.kind}${open.name ? ` "${open.name}"` : ''} is never closed`,
      });
    }

    return issues;
  },
};
