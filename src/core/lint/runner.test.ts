import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from '../model/factory';
import type { Row, WorkbookData } from '../model/types';
import { buildAllIndexes } from '../indexes';
import { createTokenCache } from './context';
import { buildDiagnosticsIndex, diagnosticCellKey, severityOf } from './diagnostics';
import { runLint } from './runner';
import type { DiagnosticIssue, LintRule } from './types';

function row(id: string, cells: Record<string, string> = {}): Row {
  return { id, cells };
}

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows = [
    row('s1', { type: 'text', name: 'q1' }),
    row('s2', { type: 'text', name: 'q2', relevant: '${q3}' }),
    row('s3', { type: 'text', name: 'q3' }),
    row('s4', { type: 'select_one list', name: 'q4' }),
    row('s5', { type: 'calculate', name: 'c1' }),
  ];
  data.choices.rows = [
    row('c1', { list_name: 'list', name: 'yes', label: 'Yes' }),
    row('c2', { list_name: 'list', name: 'yes', label: 'Yes again' }),
  ];
  data.settings.rows = [row('t1', { form_id: 'f', instance_name: '${missing}' })];
  return data;
}

function issue(overrides: Partial<DiagnosticIssue>): DiagnosticIssue {
  return {
    ruleId: 'XLS-999',
    severity: 'error',
    sheet: 'survey',
    rowId: 's1',
    message: 'test',
    ...overrides,
  };
}

describe('lint runner (Task 4.7)', () => {
  it('runs custom rules and sorts sheet → row → column', () => {
    const data = workbook();
    const indexes = buildAllIndexes(data);
    const rule: LintRule = {
      id: 'XLS-999',
      severity: 'error',
      run: () => [
        issue({ sheet: 'settings', rowId: 't1', column: 'form_id' }),
        issue({ sheet: 'survey', rowId: 's3', column: 'name' }),
        issue({ sheet: 'survey', rowId: 's2', column: 'relevant' }),
        issue({ sheet: 'survey', rowId: 's2', column: 'name' }),
        issue({ sheet: 'choices', rowId: 'c1', column: 'name' }),
      ],
    };
    const issues = runLint(data, indexes, { rules: [rule] });
    expect(issues.map((entry) => `${entry.sheet}:${entry.rowId}:${entry.column}`)).toEqual([
      'survey:s2:name',
      'survey:s2:relevant',
      'survey:s3:name',
      'choices:c1:name',
      'settings:t1:form_id',
    ]);
  });

  it('is deterministic for identical sort keys', () => {
    const data = workbook();
    const indexes = buildAllIndexes(data);
    const ruleA: LintRule = {
      id: 'XLS-002',
      severity: 'error',
      run: () => [issue({ rowId: 's1', ruleId: 'XLS-002' })],
    };
    const ruleB: LintRule = {
      id: 'XLS-001',
      severity: 'error',
      run: () => [issue({ rowId: 's1', ruleId: 'XLS-001' })],
    };
    const first = runLint(data, indexes, { rules: [ruleA, ruleB] });
    const second = runLint(data, indexes, { rules: [ruleB, ruleA] });
    expect(first.map((entry) => entry.ruleId)).toEqual(['XLS-001', 'XLS-002']);
    expect(second.map((entry) => entry.ruleId)).toEqual(['XLS-001', 'XLS-002']);
  });

  it('accepts an injected token cache and reuses entries', () => {
    const data = workbook();
    const indexes = buildAllIndexes(data);
    const cache = createTokenCache();
    const source = '${q1} and ${q2}';
    expect(cache.get(source)).toBe(cache.get(source));
    const rule: LintRule = {
      id: 'XLS-998',
      severity: 'warning',
      run: (ctx) => {
        expect(ctx.tokens.get(source)).toBe(ctx.tokens.get(source));
        return [];
      },
    };
    expect(runLint(data, indexes, { rules: [rule], tokenCache: cache })).toEqual([]);
  });

  it('runs all catalog rules and reports the real issues', () => {
    const issues = runLint(workbook(), buildAllIndexes(workbook()));
    expect(issues.map((entry) => entry.ruleId)).toEqual([
      'XLS-010',
      'XLS-010',
      'XLS-005',
      'XLS-010',
      'XLS-010',
      'XLS-009',
      'XLS-007',
      'XLS-007',
      'XLS-004',
    ]);
  });

  it('returns no diagnostics for a clean workbook', () => {
    const data = createEmptyWorkbook();
    data.survey.rows = [
      row('s1', { type: 'text', name: 'q1', label: 'Question 1' }),
      row('s2', { type: 'select_one yes_no', name: 'q2', label: 'Question 2' }),
      row('s3', {
        type: 'calculate',
        name: 'c1',
        calculation: 'coalesce(${q1}, 0)',
      }),
    ];
    data.choices.rows = [
      row('c1', { list_name: 'yes_no', name: 'yes', label: 'Yes' }),
      row('c2', { list_name: 'yes_no', name: 'no', label: 'No' }),
    ];
    data.settings.rows = [row('t1', { form_id: 'f', form_title: 'Clean', instance_name: '${q1}' })];
    expect(runLint(data, buildAllIndexes(data))).toEqual([]);
  });
});

describe('diagnostics index', () => {
  const issues: DiagnosticIssue[] = [
    issue({ rowId: 's1', column: 'name', severity: 'error' }),
    issue({ rowId: 's1', column: 'name', severity: 'warning', ruleId: 'XLS-010' }),
    issue({ rowId: 's2', column: 'relevant', severity: 'warning' }),
    issue({ sheet: 'choices', rowId: 'c1', column: 'name' }),
  ];

  it('groups by cell and row and counts severities', () => {
    const index = buildDiagnosticsIndex(issues);
    expect(index.counts).toEqual({ errors: 2, warnings: 2 });
    expect(index.byCell.get(diagnosticCellKey('s1', 'name'))).toHaveLength(2);
    expect(index.byCell.get(diagnosticCellKey('s2', 'relevant'))).toHaveLength(1);
    expect(index.byRow.get('s1')).toEqual({ errors: 1, warnings: 1 });
    expect(index.byRow.get('s2')).toEqual({ errors: 0, warnings: 1 });
    expect(index.bySheet.survey).toHaveLength(3);
    expect(index.bySheet.choices).toHaveLength(1);
    expect(index.bySheet.settings).toHaveLength(0);
  });

  it('derives the severity for a row', () => {
    expect(severityOf({ errors: 1, warnings: 0 })).toBe('error');
    expect(severityOf({ errors: 0, warnings: 2 })).toBe('warning');
    expect(severityOf({ errors: 0, warnings: 0 })).toBeUndefined();
  });
});
