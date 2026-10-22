/** XLS-004 Undefined `${variable}` reference (PRD §4.5). */
import { resolveColumn } from '../../model/columns';
import type { ColumnKey, Row, SheetData } from '../../model/types';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { cell, columnFor, definedVariableNames } from './helpers';

function reportCell(
  issues: DiagnosticIssue[],
  sheet: 'survey' | 'settings',
  row: Row,
  column: ColumnKey,
  text: string,
  defined: Set<string>,
  tokens: LintContext['tokens'],
): void {
  if (!text || !text.includes('$')) return;
  for (const token of tokens.get(text)) {
    if (token.kind !== 'varRef') continue;
    const name = token.name ?? '';
    if (defined.has(name)) continue;
    issues.push({
      ruleId: 'XLS-004',
      severity: 'error',
      sheet,
      rowId: row.id,
      column,
      range: { from: token.from, to: Math.max(token.from + 1, token.to) },
      message: `Undefined variable \${${name}}`,
    });
  }
}

function isReferenceColumn(column: ColumnKey): boolean {
  const resolved = resolveColumn(column);
  return (
    resolved.isXPath ||
    resolved.base === 'label' ||
    resolved.base === 'hint' ||
    resolved.base === 'constraint_message'
  );
}

function instanceNameColumn(sheet: SheetData): ColumnKey | undefined {
  return columnFor(sheet, 'instance_name');
}

export const xls004: LintRule = {
  id: 'XLS-004',
  severity: 'error',
  run(ctx: LintContext): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    const defined = definedVariableNames(ctx.indexes);
    const survey = ctx.data.survey;
    const referenceSet = new Set(survey.columns.filter(isReferenceColumn));

    for (const entry of ctx.varRefCells) {
      if (!referenceSet.has(entry.column)) continue;
      reportCell(issues, 'survey', entry.row, entry.column, entry.text, defined, ctx.tokens);
    }

    const settingsName = instanceNameColumn(ctx.data.settings);
    if (settingsName) {
      for (const row of ctx.data.settings.rows) {
        reportCell(
          issues,
          'settings',
          row,
          settingsName,
          cell(row, settingsName),
          defined,
          ctx.tokens,
        );
      }
    }

    return issues;
  },
};
