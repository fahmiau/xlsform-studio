/** XLS-011 Choice literal not present in the bound list (PRD §4.5). */
import { resolveColumn } from '../../model/columns';
import { findChoiceValueReferences } from '../../xpath/context';
import type { DiagnosticIssue, LintContext, LintRule } from '../types';
import { selectVariable } from './helpers';
export const xls011: LintRule = {
  id: 'XLS-011',
  severity: 'warning',
  run(ctx: LintContext): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    const survey = ctx.data.survey;
    const xpathSet = new Set(survey.columns.filter((column) => resolveColumn(column).isXPath));
    const choiceNameKey =
      ctx.data.choices.columns.find((candidate) => resolveColumn(candidate).base === 'name') ??
      'name';

    for (const entry of ctx.varRefCells) {
      if (!xpathSet.has(entry.column)) continue;
      if (!entry.text.includes("'") && !entry.text.includes('"')) continue;
      if (!entry.text.includes('selected') && !/['"][^'"]+['"]/.test(entry.text)) continue;
      for (const reference of findChoiceValueReferences(ctx.tokens.get(entry.text))) {
        if (!reference.value) continue;
        const target = selectVariable(ctx.indexes, reference.varName);
        if (!target) continue;
        const choices = ctx.indexes.choices.byList[target.listName];
        if (!choices || choices.length === 0) continue;
        const names = new Set(choices.map((choice) => (choice.cells[choiceNameKey] ?? '').trim()));
        if (names.has(reference.value)) continue;
        issues.push({
          ruleId: 'XLS-011',
          severity: 'warning',
          sheet: 'survey',
          rowId: entry.row.id,
          column: entry.column,
          range: { from: reference.from, to: reference.to },
          message: `Choice value "${reference.value}" does not exist in list "${target.listName}"`,
          data: { listName: target.listName, value: reference.value },
        });
      }
    }
    return issues;
  },
};
