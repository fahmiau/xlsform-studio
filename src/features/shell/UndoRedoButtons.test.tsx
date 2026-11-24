import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { setCells } from '@/core/ops/cells';
import { deleteRows } from '@/core/ops/rows';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { redoWithReveal, undoWithReveal } from './UndoRedoButtons';

function seedWorkbook() {
  const data = createEmptyWorkbook();
  data.survey.columns.push('relevant');
  data.survey.rows = [
    createRow({ type: 'select_one yes_no', name: 'consent', label: 'Consent', relevant: '' }),
    createRow({ type: 'text', name: 'respondent', label: 'Respondent', relevant: '' }),
    createRow({ type: 'integer', name: 'age', label: 'Age', relevant: '' }),
  ];
  data.choices.rows = [
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
    createRow({ list_name: 'other_list', name: 'a', label: 'A' }),
  ];
  useWorkbookStore.getState().load(data);
  useWorkbookStore.temporal.getState().clear();
  useUiStore.setState({
    activeSheet: 'survey',
    activeCell: null,
    activeCells: {},
    selectedRowIds: [],
    reveal: null,
    rightTab: 'ai',
    choiceDrawer: { open: false, rowId: null },
  });
  usePrefsStore.getState().setPanelVisible('right', false);
}

describe('undoWithReveal and redoWithReveal', () => {
  beforeEach(seedWorkbook);

  it('reveals the exact row and column of the undone edit even back to the initial state', () => {
    const [r0, r1, r2] = useWorkbookStore.getState().data.survey.rows;
    expect(r0 && r1 && r2).toBeTruthy();

    useWorkbookStore
      .getState()
      .apply(
        'Edit relevant',
        (data) =>
          setCells(data, 'survey', [{ rowId: r0!.id, column: 'relevant', value: '${age} > 0' }]),
        { sheet: 'survey', rowIds: [r0!.id], columns: ['relevant'] },
      );
    useWorkbookStore
      .getState()
      .apply(
        'Delete name',
        (data) => setCells(data, 'survey', [{ rowId: r1!.id, column: 'name', value: '' }]),
        { sheet: 'survey', rowIds: [r1!.id], columns: ['name'] },
      );

    // Move selection away to a different row & column before pressing Ctrl+Z.
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: r2!.id, column: 'relevant' });

    undoWithReveal();
    expect(useWorkbookStore.getState().data.survey.rows[1]?.cells.name).toBe('respondent');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'survey',
      rowId: r1!.id,
      column: 'name',
    });

    // Redo restores the clear on (r1, name) and highlights it.
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: r2!.id, column: 'relevant' });
    redoWithReveal();
    expect(useWorkbookStore.getState().data.survey.rows[1]?.cells.name ?? '').toBe('');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'survey',
      rowId: r1!.id,
      column: 'name',
    });

    // Undoing all the way back to the initial loaded state still reveals (r0, relevant).
    undoWithReveal();
    undoWithReveal();
    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.relevant).toBe('');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'survey',
      rowId: r0!.id,
      column: 'relevant',
    });
  });

  it('reveals restored deleted rows via undoRowIds and neighbor rows on redo', () => {
    const [r0, r1] = useWorkbookStore.getState().data.survey.rows;
    expect(r0 && r1).toBeTruthy();

    useWorkbookStore
      .getState()
      .apply('Delete 1 row', (data) => deleteRows(data, 'survey', [r0!.id]), {
        sheet: 'survey',
        rowIds: [r1!.id],
        undoRowIds: [r0!.id],
      });

    undoWithReveal();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(3);
    expect(useUiStore.getState().reveal).toMatchObject({ sheet: 'survey', rowId: r0!.id });

    redoWithReveal();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(2);
    expect(useUiStore.getState().reveal).toMatchObject({ sheet: 'survey', rowId: r1!.id });
  });

  it('keeps survey active for drawer edits only while the drawer shows that list', () => {
    const consentRow = useWorkbookStore.getState().data.survey.rows[0]!;
    const yesChoice = useWorkbookStore.getState().data.choices.rows[0]!;
    const otherChoice = useWorkbookStore.getState().data.choices.rows[1]!;

    usePrefsStore.getState().setPanelVisible('right', true);
    useUiStore.getState().openChoicesDrawer(consentRow.id);

    useWorkbookStore
      .getState()
      .apply(
        'Edit choice',
        (data) =>
          setCells(data, 'choices', [{ rowId: yesChoice.id, column: 'label', value: 'Yep' }]),
        { sheet: 'choices', rowIds: [yesChoice.id], columns: ['label'], inDrawer: true },
      );

    undoWithReveal();
    expect(useUiStore.getState().activeSheet).toBe('survey');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'choices',
      rowId: yesChoice.id,
      column: 'label',
      switchSheet: false,
    });

    // When the drawer edit belongs to another list, undo switches to the choices sheet.
    useWorkbookStore
      .getState()
      .apply(
        'Edit other choice',
        (data) =>
          setCells(data, 'choices', [{ rowId: otherChoice.id, column: 'label', value: 'Beta' }]),
        { sheet: 'choices', rowIds: [otherChoice.id], columns: ['label'], inDrawer: true },
      );
    undoWithReveal();
    expect(useUiStore.getState().activeSheet).toBe('choices');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'choices',
      rowId: otherChoice.id,
      column: 'label',
    });
  });
});
