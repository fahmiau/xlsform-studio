import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { SharedListBanner } from './SharedListBanner';

function setup() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'select_one yes_no', name: 'consent', label: 'Consent?' }),
    createRow({ type: 'select_one yes_no', name: 'again', label: 'Again?' }),
  );
  data.choices.rows.push(
    createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
    createRow({ list_name: 'yes_no', name: 'no', label: 'No' }),
  );
  useWorkbookStore.getState().load(data);
  return data;
}

beforeEach(() => {
  useWorkbookStore.getState().newWorkbook();
  useUiStore.setState({ dismissedSharedLists: new Set() });
});

describe('SharedListBanner (Task 3.6)', () => {
  it('shows usage and expands the question list', async () => {
    const user = userEvent.setup();
    const data = setup();
    render(<SharedListBanner listName="yes_no" surveyRowId={data.survey.rows[0]!.id} />);
    expect(screen.getByText(/Used by 2 questions/)).toBeInTheDocument();
    await user.click(screen.getByTestId('shared-list-toggle'));
    expect(screen.getByText(/consent/)).toBeInTheDocument();
    expect(screen.getByText(/again/)).toBeInTheDocument();
  });

  it('forks the list for the current question only', async () => {
    const user = userEvent.setup();
    const data = setup();
    render(<SharedListBanner listName="yes_no" surveyRowId={data.survey.rows[0]!.id} />);
    await user.click(screen.getByTestId('fork-list'));
    const next = useWorkbookStore.getState().data;
    expect(next.survey.rows[0]?.cells.type).toBe('select_one consent');
    expect(next.survey.rows[1]?.cells.type).toBe('select_one yes_no');
    expect(next.choices.rows.filter((row) => row.cells.list_name === 'consent')).toHaveLength(2);
  });

  it('hides itself after Edit Shared and when only one question uses the list', async () => {
    const user = userEvent.setup();
    const data = setup();
    const { rerender } = render(
      <SharedListBanner listName="yes_no" surveyRowId={data.survey.rows[0]!.id} />,
    );
    await user.click(screen.getByTestId('edit-shared'));
    expect(screen.queryByTestId('shared-list-banner')).not.toBeInTheDocument();
    rerender(<SharedListBanner listName="yes_no" surveyRowId={data.survey.rows[0]!.id} />);
    expect(screen.queryByTestId('shared-list-banner')).not.toBeInTheDocument();
  });
});
