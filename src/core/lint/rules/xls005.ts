/** XLS-005 Forward `${variable}` reference (warning, PRD §4.5). */
import { resolveColumn } from '../../model/columns';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';

export const xls005: LintRule = {
  id: 'XLS-005',
  severity: 'warning',
  run(ctx: LintContext): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    const survey = ctx.data.survey;
    const xpathSet = new Set(survey.columns.filter((column) => resolveColumn(column).isXPath));

    for (const entry of ctx.varRefCells) {
      if (!xpathSet.has(entry.column)) continue;
      const rowIndex = entry.rowIndex;
      for (const token of ctx.tokens.get(entry.text)) {
        if (token.kind !== 'varRef') continue;
        const metadata = ctx.indexes.variables.variables[token.name ?? ''];
        if (!metadata || metadata.rowIndex <= rowIndex) continue;
        issues.push({
          ruleId: 'XLS-005',
          severity: 'warning',
          sheet: 'survey',
          rowId: entry.row.id,
          column: entry.column,
          range: { from: token.from, to: Math.max(token.from + 1, token.to) },
          message: `Forward reference \${${metadata.name}} is declared later (row ${metadata.rowIndex + 1})`,
          data: { referencedRowId: metadata.rowId },
        });
      }
    }

    return issues;
  },
};
