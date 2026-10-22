/** XLS-008 XPath syntax error in expression columns (PRD §4.5). */
import { resolveColumn } from '../../model/columns';
import { bracketDiagnostics } from '../../xpath/tokenize';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';

const SYNTAX_BASES = new Set(['relevant', 'calculation', 'constraint', 'choice_filter']);

export const xls008: LintRule = {
  id: 'XLS-008',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    const survey = ctx.data.survey;
    const syntaxSet = new Set(
      survey.columns.filter((column) => SYNTAX_BASES.has(resolveColumn(column).base)),
    );

    for (const row of survey.rows) {
      for (const column in row.cells) {
        if (!syntaxSet.has(column)) continue;
        const text = row.cells[column] ?? '';
        if (!text || !/[('"$]/.test(text)) continue;
        for (const diagnostic of bracketDiagnostics(ctx.tokens.get(text))) {
          issues.push({
            ruleId: 'XLS-008',
            severity: 'error',
            sheet: 'survey',
            rowId: row.id,
            column,
            range: { from: diagnostic.from, to: diagnostic.to },
            message: diagnostic.message,
            data: { code: diagnostic.code },
          });
        }
      }
    }
    return issues;
  },
};
