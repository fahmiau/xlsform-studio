/** Lint runner (Task 4.7): deterministic ordering over the rule catalog. */
import type { AllIndexes } from '../indexes';
import type { ColumnKey, ManagedSheetName } from '../model/types';
import type { WorkbookData } from '../model/types';

import { createLintContext } from './context';
import { LINT_RULES } from './rules';
import type { DiagnosticIssue, LintRule, TokenCache } from './types';

const SHEET_RANK: Record<ManagedSheetName, number> = {
  survey: 0,
  choices: 1,
  settings: 2,
};

export interface RunLintOptions {
  rules?: readonly LintRule[];
  tokenCache?: TokenCache;
}

function rowIndexOf(
  data: WorkbookData,
  indexes: AllIndexes,
  sheet: ManagedSheetName,
  rowId: string,
): number {
  const direct = indexes.rowIndexes[sheet].get(rowId);
  if (direct !== undefined) return direct;
  return data[sheet].rows.findIndex((row) => row.id === rowId);
}

function columnIndexOf(data: WorkbookData, sheet: ManagedSheetName, column?: ColumnKey): number {
  if (!column) return -1;
  return data[sheet].columns.indexOf(column);
}

export function compareDiagnostics(
  data: WorkbookData,
  indexes: AllIndexes,
  left: DiagnosticIssue,
  right: DiagnosticIssue,
): number {
  const sheet = SHEET_RANK[left.sheet] - SHEET_RANK[right.sheet];
  if (sheet !== 0) return sheet;
  const row =
    rowIndexOf(data, indexes, left.sheet, left.rowId) -
    rowIndexOf(data, indexes, right.sheet, right.rowId);
  if (row !== 0) return row;
  const column =
    columnIndexOf(data, left.sheet, left.column) - columnIndexOf(data, right.sheet, right.column);
  if (column !== 0) return column;
  const range = (left.range?.from ?? -1) - (right.range?.from ?? -1);
  if (range !== 0) return range;
  return left.ruleId.localeCompare(right.ruleId);
}

/** Run every rule and return diagnostics sorted sheet → row → column. */
export function runLint(
  data: WorkbookData,
  indexes: AllIndexes,
  options: RunLintOptions = {},
): DiagnosticIssue[] {
  const ctx = createLintContext(data, indexes, {
    ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
  });
  const rules = options.rules ?? LINT_RULES;
  const issues: DiagnosticIssue[] = [];
  for (const rule of rules) {
    issues.push(...rule.run(ctx));
  }
  return issues.sort((left, right) => compareDiagnostics(data, indexes, left, right));
}
