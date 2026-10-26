import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkbookData } from '@/core/model/types';

import { insertIntoActiveCell } from './insertText';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label', 'relevant'],
      rows: [
        { id: 's1', cells: { type: 'text', name: 'age', label: 'Age' } },
        { id: 's2', cells: { type: 'end_group', name: '' } },
      ],
    },
    choices: {
      sheetName: 'choices',
      columns: ['list_name', 'name', 'label'],
      rows: [{ id: 'c1', cells: { list_name: 'x', name: 'a', label: 'A' } }],
    },
    settings: {
      sheetName: 'settings',
      columns: ['form_title'],
      rows: [{ id: 't1', cells: { form_title: 'T' } }],
    },
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}

describe('insertIntoActiveCell (Task 6.5)', () => {
  beforeEach(() => {
    useWorkbookStore.getState().load(workbook());
    useUiStore.getState().setActiveCell(null);
  });

  it('writes the text as one undoable action', () => {
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's1', column: 'label' });
    expect(insertIntoActiveCell('Umur').ok).toBe(true);
    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.label).toBe('Umur');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.label).toBe('Age');
  });

  it('refuses when no cell is active', () => {
    const result = insertIntoActiveCell('x');
    expect(result.ok).toBe(false);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('refuses the settings sheet', () => {
    useUiStore.getState().setActiveCell({ sheet: 'settings', rowId: 't1', column: 'form_title' });
    expect(insertIntoActiveCell('x').ok).toBe(false);
  });

  it('refuses a structurally read-only cell', () => {
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's2', column: 'relevant' });
    const result = insertIntoActiveCell('x');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('read-only');
  });

  it('works on the choices sheet', () => {
    useUiStore.getState().setActiveCell({ sheet: 'choices', rowId: 'c1', column: 'label' });
    expect(insertIntoActiveCell('Ya').ok).toBe(true);
    expect(useWorkbookStore.getState().data.choices.rows[0]?.cells.label).toBe('Ya');
  });
});
