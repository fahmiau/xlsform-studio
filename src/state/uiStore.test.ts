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
});
