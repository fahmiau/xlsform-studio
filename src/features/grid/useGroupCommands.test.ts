import { beforeEach, describe, expect, it } from 'vitest';

import type { AppCommand } from '@/lib/commands';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { groupCommands } from './useGroupCommands';

function command(id: string): AppCommand {
  const found = groupCommands().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing command ${id}`);
  return found;
}

function seed() {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.getState().apply('Seed', (data) => ({
    ...data,
    survey: {
      ...data.survey,
      rows: [
        { id: 'row-a', cells: { type: 'text', name: 'q1' } },
        { id: 'row-b', cells: { type: 'text', name: 'q2' } },
      ],
    },
    choices: {
      ...data.choices,
      rows: [
        { id: 'choice-a', cells: { list_name: 'l1', name: 'a' } },
        { id: 'choice-b', cells: { list_name: 'l1', name: 'b' } },
      ],
    },
  }));
  useWorkbookStore.temporal.getState().clear();
  useUiStore.setState({
    activeSheet: 'survey',
    activeCell: null,
    activeCells: {},
    selectedRowIds: [],
    choiceDrawer: { open: false, rowId: null },
  });
}

function historyLength(): number {
  return useWorkbookStore.temporal.getState().pastStates.length;
}

describe('row-delete shortcuts (Shift/Ctrl+Delete)', () => {
  beforeEach(seed);

  it('deletes the selected survey row as one undo step', () => {
    useUiStore.getState().setSelectedRowIds(['row-a']);

    command('grid.row.delete').run();

    expect(useWorkbookStore.getState().data.survey.rows.map((row) => row.id)).toEqual(['row-b']);
    expect(historyLength()).toBe(1);
  });

  it('deletes the selected choice rows from the open drawer and keeps the survey tab', () => {
    useUiStore.setState({
      choiceDrawer: { open: true, rowId: 'row-a' },
      activeCell: { sheet: 'choices', rowId: 'choice-a', column: 'name' },
      selectedRowIds: ['choice-a'],
    });

    command('grid.row.deleteCtrl').run();

    const data = useWorkbookStore.getState().data;
    expect(data.choices.rows.map((row) => row.id)).toEqual(['choice-b']);
    expect(data.survey.rows).toHaveLength(2);
    expect(useUiStore.getState().activeSheet).toBe('survey');
    expect(historyLength()).toBe(1);
  });

  it('deletes choice rows when the Choices tab is visible without the drawer flag', () => {
    // Survey selection is stale from before the user clicked into the right-panel
    // Choices tab; only the active cell says which grid owns the delete.
    useWorkbookStore.getState().apply('Seed one survey row', (data) => ({
      ...data,
      survey: { ...data.survey, rows: [{ id: 'row-a', cells: { type: 'text', name: 'q1' } }] },
    }));
    useWorkbookStore.temporal.getState().clear();
    useUiStore.setState({
      activeSheet: 'survey',
      choiceDrawer: { open: false, rowId: null },
      activeCell: { sheet: 'choices', rowId: 'choice-a', column: 'name' },
      selectedRowIds: ['row-a'],
    });

    command('grid.row.deleteCtrl').run();

    const data = useWorkbookStore.getState().data;
    expect(data.choices.rows.map((row) => row.id)).toEqual(['choice-b']);
    expect(data.survey.rows.map((row) => row.id)).toEqual(['row-a']);
  });

  it('is a no-op on the settings sheet', () => {
    useUiStore.setState({ activeSheet: 'settings' });

    command('grid.row.delete').run();

    expect(historyLength()).toBe(0);
  });
});
