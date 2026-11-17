import { beforeEach, describe, expect, it } from 'vitest';

import { createRow } from '@/core/model/factory';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import {
  deleteSelectedRows,
  duplicateSelectedRows,
  insertRowsAt,
  insertRowsAtSelection,
  rowCommands,
} from './useRowCommands';

function reset() {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.temporal.getState().clear();
  usePrefsStore.getState().setPanelVisible('right', false);
  useUiStore.setState({
    activeSheet: 'survey',
    activeCell: null,
    activeCells: {},
    selectedRowIds: [],
    choiceDrawer: { open: false, rowId: null },
    rightTab: 'choices',
  });
}

describe('row commands (Task 2.4)', () => {
  beforeEach(reset);

  it('inserts below and above the selection as one undo step', () => {
    insertRowsAtSelection('below');
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(1);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);

    insertRowsAtSelection('below');
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(2);

    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(1);

    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(0);
  });

  it('selects the inserted row', () => {
    const [id] = insertRowsAtSelection('below', 2);
    const ui = useUiStore.getState();
    expect(ui.selectedRowIds).toHaveLength(2);
    expect(ui.selectedRowIds[0]).toBe(id);
    expect(ui.activeCell?.rowId).toBe(id);
    expect(ui.reveal?.rowId).toBe(id);
  });

  it('duplicates and deletes selected rows', () => {
    useUiStore.getState().setSelectedRowIds([]);
    useWorkbookStore.getState().apply('Seed', (data) => ({
      ...data,
      survey: {
        ...data.survey,
        rows: [{ id: 'row-a', cells: { type: 'text', name: 'q1' } }],
      },
    }));
    useUiStore.getState().setSelectedRowIds(['row-a']);

    const created = duplicateSelectedRows();
    expect(created).toHaveLength(1);
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(2);

    useUiStore.getState().setSelectedRowIds(created);
    deleteSelectedRows();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(1);
  });

  it('inserts N rows at an explicit index', () => {
    useWorkbookStore.getState().apply('Seed', (data) => ({
      ...data,
      survey: {
        ...data.survey,
        rows: [{ id: 'row-a', cells: { type: 'text', name: 'q1' } }],
      },
    }));
    const ids = insertRowsAt(0, 3);
    expect(ids).toHaveLength(3);
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(4);
  });

  it('deletes non-contiguous selected rows in one action', () => {
    useWorkbookStore.getState().apply('Seed', (data) => ({
      ...data,
      survey: {
        ...data.survey,
        rows: [
          { id: 'row-a', cells: { type: 'text', name: 'q1' } },
          { id: 'row-b', cells: { type: 'text', name: 'q2' } },
          { id: 'row-c', cells: { type: 'text', name: 'q3' } },
        ],
      },
    }));
    useUiStore.getState().setSelectedRowIds(['row-a', 'row-c']);
    const before = useWorkbookStore.temporal.getState().pastStates.length;
    deleteSelectedRows();
    expect(useWorkbookStore.getState().data.survey.rows.map((row) => row.id)).toEqual(['row-b']);
    expect(useWorkbookStore.temporal.getState().pastStates.length).toBe(before + 1);
  });

  it('does nothing on the settings sheet', () => {
    useUiStore.setState({ activeSheet: 'settings' });
    expect(insertRowsAtSelection('below')).toEqual([]);
    expect(duplicateSelectedRows()).toEqual([]);
    expect(deleteSelectedRows()).toEqual([]);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('binds Ctrl+Enter and Ctrl+I to insert row below', () => {
    const commands = rowCommands();
    expect(commands.find((c) => c.id === 'grid.row.insertBelow')?.shortcut).toEqual({
      code: 'Enter',
      ctrlOrMeta: true,
    });
    expect(commands.find((c) => c.id === 'grid.row.insertBelowAlt')?.shortcut).toEqual({
      code: 'KeyI',
      ctrlOrMeta: true,
    });
  });

  it('inserts a choice row into the bound list in one undo step when ChoicesDrawer is focused', () => {
    const surveyRow = createRow({ type: 'select_one drinks', name: 'drink', label: 'Drink' });
    const choiceRow = createRow({ list_name: 'drinks', name: 'water', label: 'Water' });
    useWorkbookStore.getState().apply('Seed', (data) => ({
      ...data,
      survey: { ...data.survey, rows: [surveyRow] },
      choices: { ...data.choices, rows: [choiceRow] },
    }));
    useWorkbookStore.temporal.getState().clear();
    usePrefsStore.getState().setPanelVisible('right', true);
    useUiStore.getState().openChoicesDrawer(surveyRow.id);
    useUiStore.getState().setActiveCell({ sheet: 'choices', rowId: choiceRow.id, column: 'label' });

    const inserted = insertRowsAtSelection('below');
    expect(inserted).toHaveLength(1);
    const choices = useWorkbookStore.getState().data.choices.rows;
    expect(choices).toHaveLength(2);
    expect(choices[1]?.cells.list_name).toBe('drinks');
    expect(choices[1]?.cells.name).toBe('opt_2');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useUiStore.getState().activeCell).toMatchObject({
      sheet: 'choices',
      rowId: inserted[0],
    });
  });

  it('copies list_name when inserting a row on the choices sheet', () => {
    const first = createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' });
    useWorkbookStore.getState().apply('Seed', (data) => ({
      ...data,
      choices: { ...data.choices, rows: [first] },
    }));
    useUiStore.getState().setActiveSheet('choices');
    useUiStore.getState().setSelectedRowIds([first.id]);

    const inserted = insertRowsAtSelection('below');
    expect(inserted).toHaveLength(1);
    const rows = useWorkbookStore.getState().data.choices.rows;
    expect(rows).toHaveLength(2);
    expect(rows[1]?.cells.list_name).toBe('yes_no');
  });
});
