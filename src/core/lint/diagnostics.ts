/** Diagnostics summary index shared by the grid, outline, badge, and panel. */
import type { DiagnosticIssue, LintSeverity } from './types';

export interface RowDiagnosticCount {
  errors: number;
  warnings: number;
}

export interface DiagnosticsIndex {
  /** `rowId\u0000column` → issues in runner order. */
  byCell: Map<string, DiagnosticIssue[]>;
  byRow: Map<string, RowDiagnosticCount>;
  counts: { errors: number; warnings: number };
  /** Diagnostics grouped by sheet, preserving runner order. */
  bySheet: Record<'survey' | 'choices' | 'settings', DiagnosticIssue[]>;
}

export function diagnosticCellKey(rowId: string, column: string): string {
  return `${rowId}\u0000${column}`;
}

export function buildDiagnosticsIndex(issues: readonly DiagnosticIssue[]): DiagnosticsIndex {
  const byCell = new Map<string, DiagnosticIssue[]>();
  const byRow = new Map<string, RowDiagnosticCount>();
  const bySheet: DiagnosticsIndex['bySheet'] = { survey: [], choices: [], settings: [] };
  const counts = { errors: 0, warnings: 0 };

  for (const issue of issues) {
    if (issue.column) {
      const key = diagnosticCellKey(issue.rowId, issue.column);
      const list = byCell.get(key);
      if (list) list.push(issue);
      else byCell.set(key, [issue]);
    }
    const row = byRow.get(issue.rowId) ?? { errors: 0, warnings: 0 };
    if (issue.severity === 'error') {
      row.errors += 1;
      counts.errors += 1;
    } else {
      row.warnings += 1;
      counts.warnings += 1;
    }
    byRow.set(issue.rowId, row);
    bySheet[issue.sheet].push(issue);
  }

  return { byCell, byRow, counts, bySheet };
}

export function severityOf(count: RowDiagnosticCount): LintSeverity | undefined {
  if (count.errors > 0) return 'error';
  if (count.warnings > 0) return 'warning';
  return undefined;
}
