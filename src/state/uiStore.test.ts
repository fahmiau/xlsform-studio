import { beforeEach, describe, expect, it } from 'vitest';

import { selectIsDirty, useWorkbookStore } from './workbookStore';
import { useUiStore } from './uiStore';

beforeEach(() => {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.temporal.getState().clear();
});

describe('uiStore', () => {
  it('stores fold state outside the document (AD-3)', () => {
    const dataBefore = useWorkbookStore.getState().data;
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);

    useUiStore.getState().toggleGroupCollapsed('group_1');
    useUiStore.getState().toggleGroupCollapsed('group_2');
    expect([...useUiStore.getState().collapsedGroupIds]).toEqual(['group_1', 'group_2']);

    useUiStore.getState().toggleGroupCollapsed('group_1');
    expect([...useUiStore.getState().collapsedGroupIds]).toEqual(['group_2']);

    expect(useWorkbookStore.getState().data).toBe(dataBefore);
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('switches sheets when revealing a row from another sheet', () => {
    useUiStore.getState().setActiveSheet('survey');
    useUiStore.getState().requestReveal('choices', 'choice-row');
    expect(useUiStore.getState().activeSheet).toBe('choices');
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'choices',
      rowId: 'choice-row',
    });
  });

  it('targets the requested column and respects switchSheet: false', () => {
    useUiStore.getState().setActiveSheet('survey');
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 'r3', column: 'relevant' });

    useUiStore.getState().requestReveal('survey', 'r1', { column: 'name' });
    expect(useUiStore.getState().activeCell).toEqual({
      sheet: 'survey',
      rowId: 'r1',
      column: 'name',
    });
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'survey',
      rowId: 'r1',
      column: 'name',
    });

    useUiStore.getState().requestReveal('choices', 'c1', { column: 'label', switchSheet: false });
    expect(useUiStore.getState().activeSheet).toBe('survey');
    expect(useUiStore.getState().activeCells.choices).toEqual({
      sheet: 'choices',
      rowId: 'c1',
      column: 'label',
    });
    expect(useUiStore.getState().reveal).toMatchObject({
      sheet: 'choices',
      rowId: 'c1',
      column: 'label',
      switchSheet: false,
    });
  });

  it('tracks active sheet, cell, selection, panels, and language view', () => {
    const cell = { sheet: 'survey' as const, rowId: 'r1', column: 'label' };
    useUiStore.getState().setActiveSheet('choices');
    useUiStore.getState().setActiveCell(cell);
    useUiStore.getState().setSelection({ sheet: 'survey', anchor: cell, focus: cell });
    useUiStore.getState().setPanel('lint', true);
    useUiStore.getState().setLanguageView('single', 'id');

    expect(useUiStore.getState()).toMatchObject({
      activeSheet: 'choices',
      activeCell: cell,
      selection: { sheet: 'survey', anchor: cell, focus: cell },
      panels: { outline: true, lint: true, ai: false },
      languageView: { mode: 'single', language: 'id' },
    });
  });

  it('stores dialog flags and the split-view source/target', () => {
    const ui = useUiStore.getState();
    ui.setPaletteOpen(true);
    ui.setShortcutsOpen(true);
    ui.setPreferencesOpen(true);
    ui.setAddLanguageOpen(true);
    ui.setLanguageViewState({
      mode: 'split',
      language: null,
      source: 'Default',
      target: 'English (en)',
    });

    const state = useUiStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.shortcutsOpen).toBe(true);
    expect(state.preferencesOpen).toBe(true);
    expect(state.addLanguageOpen).toBe(true);
    expect(state.languageView).toEqual({
      mode: 'split',
      language: null,
      source: 'Default',
      target: 'English (en)',
    });

    ui.setPaletteOpen(false);
    ui.setShortcutsOpen(false);
    ui.setPreferencesOpen(false);
    ui.setAddLanguageOpen(false);
  });

  it('stores a session column order per sheet outside the document', () => {
    const dataBefore = useWorkbookStore.getState().data;
    useUiStore.getState().setColumnOrder('survey', ['name', 'type', 'label', 'relevant']);
    useUiStore.getState().setColumnOrder('choices', ['list_name', 'name', 'label']);

    expect(useUiStore.getState().columnOrder).toMatchObject({
      survey: ['name', 'type', 'label', 'relevant'],
      choices: ['list_name', 'name', 'label'],
    });
    expect(useWorkbookStore.getState().data).toBe(dataBefore);
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('stores customizable frozen column count per sheet outside the document', () => {
    const dataBefore = useWorkbookStore.getState().data;
    useUiStore.getState().setFrozenColumns('survey', 0);
    useUiStore.getState().setFrozenColumns('choices', 2);

    expect(useUiStore.getState().frozenColumns).toMatchObject({
      survey: 0,
      choices: 2,
    });
    useUiStore.getState().setFrozenColumns('survey', -5);
    expect(useUiStore.getState().frozenColumns.survey).toBe(0);
    expect(useWorkbookStore.getState().data).toBe(dataBefore);
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
