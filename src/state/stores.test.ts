import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCells } from '@/core/ops/cells';
import { insertRows, type RowInsert } from '@/core/ops/rows';
import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { LINT_DEBOUNCE_MS, useDerivedStore } from './derivedStore';
import { getActionMeta, selectIsDirty, useWorkbookStore } from './workbookStore';

function reset() {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.temporal.getState().clear();
}

function addQuestion(name: string) {
  useWorkbookStore
    .getState()
    .apply(`Add ${name}`, (data) =>
      insertRows(data, 'survey', data.survey.rows.length, [
        { cells: { type: 'text', name, label: name.toUpperCase() } },
      ]),
    );
}

beforeEach(reset);

describe('workbookStore history', () => {
  it('keeps only the last 100 undo states after 101 edits', () => {
    for (let index = 0; index < 101; index += 1) addQuestion(`q${index}`);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(100);
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(101);
  });

  it('undoes a composite action in one step', () => {
    const rows: RowInsert[] = [
      { cells: { type: 'begin_group', name: 'g', label: 'Group' } },
      { cells: { type: 'text', name: 'a', label: 'A' } },
      { cells: { type: 'end_group' } },
    ];

    useWorkbookStore.getState().apply('Insert group block', (data) => {
      const inserted = insertRows(data, 'survey', 0, rows);
      const first = inserted.survey.rows[0];
      const second = inserted.survey.rows[1];
      if (!first || !second) return inserted;
      return setCells(inserted, 'survey', [
        { rowId: first.id, column: 'hint', value: 'block hint' },
        { rowId: second.id, column: 'hint', value: 'question hint' },
      ]);
    });

    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(3);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);

    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(0);

    useWorkbookStore.temporal.getState().redo();
    expect(useWorkbookStore.getState().data.survey.rows[1]?.cells.hint).toBe('question hint');
  });

  it('does not record a history entry for a no-op update', () => {
    const before = useWorkbookStore.getState().data;
    useWorkbookStore.getState().apply('Nothing', (data) => data);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useWorkbookStore.getState().data).toBe(before);
  });

  it('clears history when a new workbook is created', () => {
    addQuestion('q1');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    useWorkbookStore.getState().newWorkbook();
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(0);
  });
});

describe('dirty tracking', () => {
  it('toggles correctly across edit, save, undo, and redo', () => {
    const store = useWorkbookStore.getState();
    expect(selectIsDirty(store)).toBe(false);

    addQuestion('q1');
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);

    useWorkbookStore.getState().markSaved('C:/forms/test.xlsx');
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
    expect(useWorkbookStore.getState().filePath).toBe('C:/forms/test.xlsx');
    expect(useWorkbookStore.getState().savedData).toBe(useWorkbookStore.getState().data);

    useWorkbookStore.temporal.getState().undo();
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);

    useWorkbookStore.temporal.getState().redo();
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
  });

  it('starts clean after loading an existing workbook', () => {
    const data = createEmptyWorkbook();
    useWorkbookStore.getState().load(data, { filePath: 'C:/forms/open.xlsx', warnings: ['w'] });
    const state = useWorkbookStore.getState();
    expect(selectIsDirty(state)).toBe(false);
    expect(state.filePath).toBe('C:/forms/open.xlsx');
    expect(state.warnings).toEqual(['w']);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('restores a snapshot as dirty and clears history', () => {
    addQuestion('q1');
    const recovered = createEmptyWorkbook();
    recovered.survey.rows.push(createRow({ type: 'text', name: 'recovered' }));

    useWorkbookStore.getState().restore(recovered, { filePath: 'C:/forms/recovered.xlsx' });
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);
    expect(useWorkbookStore.getState().filePath).toBe('C:/forms/recovered.xlsx');
    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.name).toBe('recovered');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('records action metadata for undo/redo reveal', () => {
    useWorkbookStore
      .getState()
      .apply(
        'Insert one row',
        (data) => insertRows(data, 'survey', 0, [{ cells: { type: 'text', name: 'q1' } }]),
        { sheet: 'survey', rowIds: ['row-1'] },
      );
    const meta = getActionMeta(useWorkbookStore.getState().data);
    expect(meta).toMatchObject({ label: 'Insert one row', sheet: 'survey', rowIds: ['row-1'] });

    useWorkbookStore.temporal.getState().undo();
    expect(getActionMeta(useWorkbookStore.getState().data)).toBeUndefined();
  });
});

describe('derivedStore', () => {
  it('recomputes indexes after every apply', () => {
    addQuestion('alpha');
    addQuestion('beta');
    const names = Object.keys(useDerivedStore.getState().indexes.variables.variables);
    expect(names).toEqual(['alpha', 'beta']);

    useWorkbookStore.temporal.getState().undo();
    expect(Object.keys(useDerivedStore.getState().indexes.variables.variables)).toEqual(['alpha']);
  });

  it('includes choice lists after a row is inserted', () => {
    useWorkbookStore.getState().apply('Add choice', (data) => ({
      ...data,
      choices: {
        ...data.choices,
        rows: [...data.choices.rows, createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' })],
      },
    }));
    expect(useDerivedStore.getState().indexes.choices.byList.yes_no).toHaveLength(1);
  });

  it('debounces diagnostics and runs them immediately on load', () => {
    vi.useFakeTimers();
    try {
      useWorkbookStore
        .getState()
        .apply('Add unlabeled', (data) =>
          insertRows(data, 'survey', data.survey.rows.length, [
            { cells: { type: 'text', name: 'no_label' } },
          ]),
        );
      expect(useDerivedStore.getState().diagnostics).toEqual([]);
      vi.advanceTimersByTime(LINT_DEBOUNCE_MS - 1);
      expect(useDerivedStore.getState().diagnostics).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(useDerivedStore.getState().diagnostics.map((issue) => issue.ruleId)).toContain(
        'XLS-010',
      );

      const data = createEmptyWorkbook();
      data.survey.rows.push(createRow({ type: 'calculate', name: 'c' }));
      useWorkbookStore.getState().load(data);
      expect(useDerivedStore.getState().diagnostics.map((issue) => issue.ruleId)).toContain(
        'XLS-009',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
