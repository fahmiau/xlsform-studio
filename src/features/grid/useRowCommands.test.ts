import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import {
  deleteSelectedRows,
  duplicateSelectedRows,
  insertRowsAt,
  insertRowsAtSelection,
} from './useRowCommands';

function reset() {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.temporal.getState().clear();
  useUiStore.setState({
    activeSheet: 'survey',
    activeCell: null,
    activeCells: {},
    selectedRowIds: [],
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
});
