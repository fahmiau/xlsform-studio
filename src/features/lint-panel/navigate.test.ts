/** F8 / Shift+F8 navigation (Task 4.10). */
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import type { CellRef } from '@/state/uiStore';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { nextProblem } from './navigate';

function loadDirtyForm(): void {
  const data = createEmptyWorkbook();
  data.survey.rows = [
    createRow({ type: 'text', name: '1bad', label: '' }),
    createRow({ type: 'text', name: 'q2', label: 'Q2' }),
  ];
  data.choices.rows = [
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes again' }),
  ];
  data.settings.rows = [createRow({ form_id: 'f', instance_name: '${missing}' })];
  useWorkbookStore.getState().load(data);
  useDerivedStore.getState().rebuild();
}

function setActive(cell: CellRef): void {
  useUiStore.getState().setActiveCell(cell);
}

beforeEach(() => {
  useUiStore.getState().setActiveSheet('survey');
  useUiStore.getState().setActiveCell(null);
});

describe('nextProblem', () => {
  it('does nothing when there are no diagnostics', () => {
    const data = createEmptyWorkbook();
    const row = createRow({ type: 'text', name: 'q', label: 'Q' });
    data.survey.rows = [row];
    useWorkbookStore.getState().load(data);
    useDerivedStore.getState().rebuild();
    expect(useDerivedStore.getState().diagnostics).toEqual([]);

    setActive({ sheet: 'survey', rowId: row.id, column: 'label' });
    nextProblem(1);
    expect(useUiStore.getState().activeCell?.rowId).toBe(row.id);
    expect(useUiStore.getState().reveal).toBeNull();
  });

  it('wraps from the first problem backwards to the last and forwards to the first', () => {
    loadDirtyForm();
    const diagnostics = useDerivedStore.getState().diagnostics;
    expect(diagnostics.length).toBeGreaterThan(2);
    const first = diagnostics[0]!;
    const last = diagnostics[diagnostics.length - 1]!;

    setActive({ sheet: first.sheet, rowId: first.rowId, column: first.column ?? '' });
    nextProblem(-1);
    expect(useUiStore.getState().activeCell?.rowId).toBe(last.rowId);
    expect(useUiStore.getState().activeCell?.sheet).toBe(last.sheet);

    setActive({ sheet: last.sheet, rowId: last.rowId, column: last.column ?? '' });
    nextProblem(1);
    expect(useUiStore.getState().activeCell?.rowId).toBe(first.rowId);
    expect(useUiStore.getState().activeCell?.sheet).toBe(first.sheet);
  });

  it('orders across sheets: the choice duplicate follows the last survey problem', () => {
    loadDirtyForm();
    const diagnostics = useDerivedStore.getState().diagnostics;
    const lastSurvey = diagnostics.findLast((issue) => issue.sheet === 'survey')!;
    const firstChoice = diagnostics.find((issue) => issue.sheet === 'choices')!;
    expect(firstChoice).toBeDefined();

    setActive({
      sheet: lastSurvey.sheet,
      rowId: lastSurvey.rowId,
      column: lastSurvey.column ?? '',
    });
    nextProblem(1);

    expect(useUiStore.getState().activeSheet).toBe('choices');
    expect(useUiStore.getState().activeCell?.sheet).toBe('choices');
    expect(useUiStore.getState().activeCell?.rowId).toBe(firstChoice.rowId);
    expect(useUiStore.getState().reveal?.sheet).toBe('choices');
  });
});
