/** Virtualized lint panel grouped by sheet (Task 4.10). */
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DiagnosticIssue } from '@/core/lint';
import { resolveColumn } from '@/core/model/columns';
import type { ManagedSheetName } from '@/core/model/types';
import { useDerivedStore } from '@/state/derivedStore';

import { revealDiagnostic } from './reveal';
import { useDiagnosticsIndex } from './useDiagnosticsIndex';

const SHEETS: Array<{ key: ManagedSheetName; label: string }> = [
  { key: 'survey', label: 'Survey' },
  { key: 'choices', label: 'Choices' },
  { key: 'settings', label: 'Settings' },
];

export type PanelRow =
  | { kind: 'header'; sheet: ManagedSheetName; label: string; count: number }
  | { kind: 'issue'; issue: DiagnosticIssue };

type SeverityFilter = 'all' | 'error' | 'warning';

/** Filter and group diagnostics for the virtualized panel (pure, tested). */
export function buildPanelRows(
  diagnostics: readonly DiagnosticIssue[],
  severity: SeverityFilter,
  rule: string,
): PanelRow[] {
  const result: PanelRow[] = [];
  for (const sheet of SHEETS) {
    const issues = diagnostics.filter(
      (issue) =>
        issue.sheet === sheet.key &&
        (severity === 'all' || issue.severity === severity) &&
        (rule === 'all' || issue.ruleId === rule),
    );
    if (issues.length === 0) continue;
    result.push({ kind: 'header', sheet: sheet.key, label: sheet.label, count: issues.length });
    for (const issue of issues) result.push({ kind: 'issue', issue });
  }
  return result;
}

export function LintPanel() {
  const diagnostics = useDerivedStore((state) => state.diagnostics);
  const index = useDiagnosticsIndex();
  const indexes = useDerivedStore((state) => state.indexes);
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [rule, setRule] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const rules = useMemo(
    () => [...new Set(diagnostics.map((issue) => issue.ruleId))].sort(),
    [diagnostics],
  );

  const rows = useMemo(
    () => buildPanelRows(diagnostics, severity, rule),
    [diagnostics, rule, severity],
  );

  // TanStack Virtual's hook returns non-memoizable APIs by design. The same
  // library warning is accepted on the Stage 3 Outline panel; this second call
  // site is suppressed so `pnpm lint` stays at that documented baseline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (rowIndex) => (rows[rowIndex]?.kind === 'header' ? 24 : 46),
    overscan: 10,
  });

  const rowNumber = (issue: DiagnosticIssue): number | undefined => {
    const value = indexes.rowIndexes[issue.sheet].get(issue.rowId);
    return value === undefined ? undefined : value + 1;
  };

  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="lint-panel">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
        <Select value={severity} onValueChange={(next) => setSeverity(next as typeof severity)}>
          <SelectTrigger
            size="sm"
            className="h-7 px-2 text-[11px]"
            aria-label="Filter by severity"
            data-testid="lint-severity-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All ({diagnostics.length})
            </SelectItem>
            <SelectItem value="error" className="text-xs">
              Errors ({index.counts.errors})
            </SelectItem>
            <SelectItem value="warning" className="text-xs">
              Warnings ({index.counts.warnings})
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={rule} onValueChange={setRule}>
          <SelectTrigger
            size="sm"
            className="h-7 min-w-0 flex-1 px-2 text-[11px]"
            aria-label="Filter by rule"
            data-testid="lint-rule-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All rules
            </SelectItem>
            {rules.map((id) => (
              <SelectItem key={id} value={id} className="text-xs">
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="lint-list">
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-2 text-xs">
            {diagnostics.length === 0 ? 'No problems found.' : 'No diagnostics match the filters.'}
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              if (row.kind === 'header') {
                return (
                  <div
                    key={`header:${row.sheet}`}
                    className="bg-muted/60 text-muted-foreground flex items-center justify-between px-2 text-[11px] font-medium"
                    style={rowStyle(virtualRow.start, virtualRow.size)}
                    data-testid={`lint-group-${row.sheet}`}
                  >
                    <span>{row.label}</span>
                    <span>{row.count}</span>
                  </div>
                );
              }
              const issue = row.issue;
              const number = rowNumber(issue);
              return (
                <button
                  key={`${issue.ruleId}:${issue.rowId}:${issue.column ?? ''}:${issue.range?.from ?? 0}`}
                  type="button"
                  className="hover:bg-accent flex w-full flex-col items-start gap-0.5 border-b px-2 py-1 text-left"
                  style={rowStyle(virtualRow.start, virtualRow.size)}
                  onClick={() => revealDiagnostic(issue)}
                  title={`${issue.ruleId}: ${issue.message}`}
                  data-testid="lint-item"
                  data-rule={issue.ruleId}
                  data-severity={issue.severity}
                >
                  <span className="flex w-full items-center gap-1 text-[11px]">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
                        issue.severity === 'error' ? 'bg-destructive' : 'bg-amber-500'
                      }`}
                      aria-hidden
                    />
                    <span className="font-mono font-semibold">{issue.ruleId}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {number !== undefined ? `row ${number}` : ''}
                      {issue.column ? ` · ${resolveColumn(issue.column).canonical}` : ''}
                    </span>
                  </span>
                  <span className="w-full truncate text-xs">{issue.message}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function rowStyle(start: number, size: number) {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: size,
    transform: `translateY(${start}px)`,
  };
}
