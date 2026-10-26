import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkbookData } from '@/core/model/types';

import { useStagingStore } from './stagingStore';
import { useWorkbookStore } from './workbookStore';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label'],
      rows: [{ id: 's1', cells: { type: 'text', name: 'age', label: 'Age' } }],
    },
    choices: { sheetName: 'choices', columns: ['list_name', 'name', 'label'], rows: [] },
    settings: { sheetName: 'settings', columns: ['form_title'], rows: [] },
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}

const insert = {
  afterRowIndex: 0,
  rows: [{ type: 'text', name: 'city', label: { Default: 'City' } }],
};

describe('stagingStore (AD-11)', () => {
  beforeEach(() => {
    useWorkbookStore.getState().load(workbook());
    useStagingStore.getState().revert();
  });

  it('starts with a base and draft pointing at the live data', () => {
    useStagingStore.getState().start();
    const state = useStagingStore.getState();
    expect(state.base).toBe(useWorkbookStore.getState().data);
    expect(state.draft).toBe(state.base);
    expect(state.running).toBe(true);
    expect(state.diff?.summary.total).toBe(0);
  });

  it('applies tools to the draft without touching the live document', () => {
    const live = useWorkbookStore.getState().data;
    useStagingStore.getState().start();
    const result = useStagingStore.getState().applyTool('insert_survey_rows', insert);
    expect(result.ok).toBe(true);
    expect(useWorkbookStore.getState().data).toBe(live);
    expect(useStagingStore.getState().draft?.survey.rows).toHaveLength(2);
    expect(useStagingStore.getState().diff?.summary.total).toBe(1);
  });

  it('rejects tools when no draft is active', () => {
    const result = useStagingStore.getState().applyTool('insert_survey_rows', insert);
    expect(result.ok).toBe(false);
  });

  it('accepts the draft in one undo entry', () => {
    useStagingStore.getState().start();
    useStagingStore.getState().applyTool('insert_survey_rows', insert);
    useStagingStore.getState().accept();

    const state = useWorkbookStore.getState();
    expect(state.data.survey.rows).toHaveLength(2);
    expect(state.lastAction).toContain('AI:');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useStagingStore.getState().draft).toBeNull();

    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.survey.rows).toHaveLength(1);
  });

  it('revert leaves the document untouched and not dirty', () => {
    const live = useWorkbookStore.getState().data;
    useStagingStore.getState().start();
    useStagingStore.getState().applyTool('insert_survey_rows', insert);
    useStagingStore.getState().revert();
    expect(useWorkbookStore.getState().data).toBe(live);
    expect(useWorkbookStore.getState().savedData).toBe(live);
    expect(useStagingStore.getState().draft).toBeNull();
  });

  it('accepting an unchanged draft creates no history entry', () => {
    useStagingStore.getState().start();
    useStagingStore.getState().accept();
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('keeps lint delta for the staging bar', () => {
    useStagingStore.getState().start();
    useStagingStore.getState().applyTool('insert_survey_rows', {
      afterRowIndex: 0,
      rows: [{ type: 'text', name: 'city', relevant: '${missing} > 0' }],
    });
    expect(useStagingStore.getState().lint?.added.length).toBeGreaterThan(0);
  });
});
