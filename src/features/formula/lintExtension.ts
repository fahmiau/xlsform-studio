/** CodeMirror lint underlines for the active cell's diagnostics (Task 4.10). */
import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';

import type { DiagnosticIssue } from '@/core/lint';

export function makeLintExtension(
  getIssues: () => readonly DiagnosticIssue[],
  options: { delay?: number } = {},
): Extension {
  return linter(
    (view) => {
      const length = view.state.doc.length;
      return getIssues().map((issue): Diagnostic => {
        const from = Math.max(0, Math.min(length, issue.range?.from ?? 0));
        const to = Math.max(from, Math.min(length, issue.range?.to ?? from));
        return {
          from,
          to,
          severity: issue.severity,
          message: `${issue.ruleId}: ${issue.message}`,
        };
      });
    },
    { delay: options.delay ?? 150 },
  );
}
