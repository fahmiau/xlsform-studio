/**
 * New lint errors introduced by a Build Mode draft (Task 6.6).
 *
 * The staging bar lists only *new* problems, so pre-existing warnings do not
 * scare the user away from an otherwise good change.
 */
import { buildAllIndexes } from '../indexes';
import { runLint, type DiagnosticIssue } from '../lint';
import { readSettings } from '../model/settings';
import type { WorkbookData } from '../model/types';

export interface LintDelta {
  added: DiagnosticIssue[];
  removed: DiagnosticIssue[];
}

function issueKey(issue: DiagnosticIssue): string {
  return [issue.ruleId, issue.sheet, issue.rowId, issue.column ?? '', issue.message].join('\u0000');
}

function lint(data: WorkbookData): DiagnosticIssue[] {
  const { defaultLanguage } = readSettings(data.settings);
  const indexes = buildAllIndexes(data, defaultLanguage ? { defaultLanguage } : {});
  return runLint(data, indexes);
}

export function lintDelta(base: WorkbookData, draft: WorkbookData): LintDelta {
  const baseIssues = lint(base);
  const before = new Set(baseIssues.map(issueKey));
  const draftIssues = lint(draft);
  const after = new Set(draftIssues.map(issueKey));
  return {
    added: draftIssues.filter((issue) => !before.has(issueKey(issue))),
    removed: baseIssues.filter((issue) => !after.has(issueKey(issue))),
  };
}
