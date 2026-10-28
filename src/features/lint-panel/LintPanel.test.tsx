import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import type { DiagnosticIssue } from '@/core/lint';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { LintBadge } from './LintBadge';
import { buildPanelRows, LintPanel } from './LintPanel';
import { nextProblem } from './navigate';
import { revealDiagnostic } from './reveal';

function loadDirtyForm() {
  const data = createEmptyWorkbook();
  data.survey.rows = [
    createRow({ type: 'text', name: 'q1', label: '' }),
    createRow({ type: 'integer', name: '1bad', label: '' }),
    createRow({ type: 'select_one missing', name: 'q3', label: 'Question 3' }),
  ];
  data.choices.rows = [
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes again' }),
  ];
  data.settings.rows = [createRow({ form_id: 'f', instance_name: '${missing}' })];
  useWorkbookStore.getState().load(data);
  useDerivedStore.getState().rebuild();
}

function loadCleanForm() {
  useWorkbookStore.getState().newWorkbook();
  useDerivedStore.getState().rebuild();
}

function issue(overrides: Partial<DiagnosticIssue>): DiagnosticIssue {
  return {
    ruleId: 'XLS-010',
    severity: 'warning',
    sheet: 'survey',
    rowId: 's1',
    column: 'label',
    message: 'Missing label',
    ...overrides,
  };
}

beforeEach(() => {
  useUiStore.getState().setLeftTab('outline');
  useUiStore.getState().setActiveCell(null);
  loadCleanForm();
});

describe('LintPanel (Task 4.10)', () => {
  it('shows the empty state', () => {
    render(<LintPanel />);
    expect(screen.getByTestId('lint-panel')).toBeInTheDocument();
    expect(screen.getByText('No problems found.')).toBeInTheDocument();
  });

  it('groups filtered diagnostics by sheet in sheet order', () => {
    const rows = buildPanelRows(
      [
        issue({ sheet: 'settings', rowId: 't1', ruleId: 'XLS-004', severity: 'error' }),
        issue({ sheet: 'survey', rowId: 's1', ruleId: 'XLS-010' }),
        issue({ sheet: 'choices', rowId: 'c1', ruleId: 'XLS-007', severity: 'error' }),
        issue({ sheet: 'survey', rowId: 's2', ruleId: 'XLS-001', severity: 'error' }),
      ],
      'all',
      'all',
    );
    expect(
      rows.map((row) => (row.kind === 'header' ? `header:${row.sheet}` : row.issue.ruleId)),
    ).toEqual([
      'header:survey',
      'XLS-010',
      'XLS-001',
      'header:choices',
      'XLS-007',
      'header:settings',
      'XLS-004',
    ]);
    expect(rows[0]).toMatchObject({ kind: 'header', count: 2 });
  });

  it('filters by severity and rule', () => {
    const diagnostics = [
      issue({ ruleId: 'XLS-010', severity: 'warning' }),
      issue({ ruleId: 'XLS-001', severity: 'error' }),
      issue({ sheet: 'choices', ruleId: 'XLS-007', severity: 'error' }),
    ];
    const errors = buildPanelRows(diagnostics, 'error', 'all');
    expect(errors.filter((row) => row.kind === 'issue')).toHaveLength(2);
    const rule = buildPanelRows(diagnostics, 'all', 'XLS-010');
    expect(rule.filter((row) => row.kind === 'issue')).toHaveLength(1);
    expect(rule.some((row) => row.kind === 'header' && row.sheet === 'choices')).toBe(false);
  });

  it('renders diagnostics from the derived store', () => {
    loadDirtyForm();
    render(<LintPanel />);
    expect(screen.getByTestId('lint-severity-filter')).toHaveAttribute('role', 'combobox');
    expect(screen.getByTestId('lint-rule-filter')).toHaveAttribute('role', 'combobox');
    expect(useDerivedStore.getState().diagnostics.length).toBeGreaterThan(0);
  });
});

describe('LintBadge (Task 4.10)', () => {
  it('renders the clean state', () => {
    render(<LintBadge />);
    expect(screen.getByTestId('lint-badge-counts')).toHaveTextContent('✓ 0 Errors');
  });

  it('renders counts and opens the lint tab', () => {
    loadDirtyForm();
    usePrefsStore.getState().setPanelVisible('left', false);
    render(<LintBadge />);
    const counts = useDerivedStore.getState().diagnosticIndex.counts;
    expect(screen.getByTestId('lint-badge-counts')).toHaveTextContent(`${counts.errors} Error`);
    act(() => screen.getByTestId('lint-badge').click());
    expect(useUiStore.getState().leftTab).toBe('lint');
    expect(usePrefsStore.getState().leftPanel).toBe(true);
  });
});

describe('diagnostic navigation (Task 4.10)', () => {
  it('jumps to the next and previous problem and wraps', () => {
    loadDirtyForm();
    const diagnostics = useDerivedStore.getState().diagnostics;
    expect(diagnostics.length).toBeGreaterThan(2);
    const first = diagnostics[0]!;
    const second = diagnostics[1]!;

    act(() => {
      useUiStore.getState().setActiveCell({
        sheet: first.sheet,
        rowId: first.rowId,
        column: first.column ?? '',
      });
    });
    act(() => nextProblem(1));
    expect(useUiStore.getState().activeCell?.rowId).toBe(second.rowId);
    expect(useUiStore.getState().reveal?.rowId).toBe(second.rowId);

    act(() => nextProblem(-1));
    expect(useUiStore.getState().activeCell?.rowId).toBe(first.rowId);

    act(() => nextProblem(-1));
    const last = diagnostics[diagnostics.length - 1]!;
    expect(useUiStore.getState().activeCell?.rowId).toBe(last.rowId);
  });

  it('reveals a diagnostic on another sheet', () => {
    loadDirtyForm();
    const choiceIssue = useDerivedStore
      .getState()
      .diagnostics.find((entry) => entry.sheet === 'choices');
    expect(choiceIssue).toBeDefined();
    act(() => revealDiagnostic(choiceIssue!));
    expect(useUiStore.getState().activeSheet).toBe('choices');
    expect(useUiStore.getState().activeCell?.rowId).toBe(choiceIssue!.rowId);
    expect(useUiStore.getState().reveal?.sheet).toBe('choices');
  });
});
