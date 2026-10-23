import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { ChoicesDrawer } from './ChoicesDrawer';

function setup() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(createRow({ type: 'select_one drinks', name: 'drink', label: 'Drink' }));
  useWorkbookStore.getState().load(data);
  useDerivedStore.getState().rebuild();
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

describe('ChoicesDrawer naming defaults (Task 5.7)', () => {
  it('creates the first choice with the default camelCase mode', async () => {
    const user = userEvent.setup();
    setup();
    usePrefsStore.getState().update({ defaultSlugMode: 'camel' });
    render(<ChoicesDrawer />);

    await user.click(screen.getByTestId('add-choice'));

    const rows = useWorkbookStore.getState().data.choices.rows;
    expect(rows.at(-1)?.cells.name).toBe('opt1');
    // The default is remembered for the session, so later rows keep the mode.
    expect(useUiStore.getState().choiceModes.drinks).toEqual({ kind: 'camel' });
  });

  it('keeps snake_case when the default is snake', async () => {
    const user = userEvent.setup();
    setup();
    render(<ChoicesDrawer />);

    await user.click(screen.getByTestId('add-choice'));

    const rows = useWorkbookStore.getState().data.choices.rows;
    expect(rows.at(-1)?.cells.name).toBe('opt_1');
  });
});
