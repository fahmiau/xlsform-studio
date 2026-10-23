import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { useBoundList } from './useBoundList';

function setup() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'select_one regions', name: 'region', label: 'Region' }),
    createRow({ type: 'text', name: 'notes', label: 'Notes' }),
  );
  data.choices.columns.push('province_id');
  data.choices.rows.push(
    createRow({ list_name: 'regions', name: 'north', label: 'North', province_id: 'n' }),
    createRow({ list_name: 'regions', name: 'south', label: 'South', province_id: 's' }),
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
  );
  useWorkbookStore.getState().load(data);
  useUiStore.getState().openChoicesDrawer(data.survey.rows[0]!.id);
  return data;
}

beforeEach(() => {
  useWorkbookStore.getState().newWorkbook();
  usePrefsStore.getState().update({ defaultSlugMode: 'snake' });
  useUiStore.setState({
    activeCell: null,
    choiceDrawer: { open: false, rowId: null },
    choiceModes: {},
    dismissedSharedLists: new Set(),
  });
});

describe('useBoundList (Task 3.4)', () => {
  it('filters the bound list and hides list_name and other languages', () => {
    setup();
    const { result } = renderHook(() => useBoundList());
    expect(result.current.listName).toBe('regions');
    expect(result.current.rows.map((row) => row.cells.name)).toEqual(['north', 'south']);
    expect(result.current.rowIndexes).toEqual([0, 1]);
    expect(result.current.columns).toEqual(['label', 'name', 'province_id']);
    expect(result.current.mode).toEqual({ kind: 'snake' });
  });

  it('follows the active survey row when the drawer is not pinned', () => {
    const data = setup();
    useUiStore.setState({ choiceDrawer: { open: false, rowId: null } });
    useUiStore.getState().setActiveCell({
      sheet: 'survey',
      rowId: data.survey.rows[1]!.id,
      column: 'type',
    });
    const { result } = renderHook(() => useBoundList());
    expect(result.current.listName).toBeNull();
    expect(result.current.rows).toEqual([]);
  });

  it('uses a session mode override and re-infers numeric lists', () => {
    const data = setup();
    useUiStore.getState().setChoiceMode('regions', { kind: 'numeric' });
    const { result, rerender } = renderHook(() => useBoundList());
    expect(result.current.mode).toEqual({ kind: 'numeric' });

    useUiStore.getState().setDrawerRow(data.survey.rows[0]!.id);
    rerender();
    expect(result.current.mode).toEqual({ kind: 'numeric' });
  });

  it('uses the Preferences default for a list that has no names yet', () => {
    const data = setup();
    usePrefsStore.getState().update({ defaultSlugMode: 'camel' });
    data.survey.rows.push(createRow({ type: 'select_one drinks', name: 'drink' }));
    useWorkbookStore.getState().load(data);
    useUiStore.getState().openChoicesDrawer(data.survey.rows[2]!.id);

    const { result } = renderHook(() => useBoundList());
    expect(result.current.listName).toBe('drinks');
    expect(result.current.mode).toEqual({ kind: 'camel' });
  });
});
