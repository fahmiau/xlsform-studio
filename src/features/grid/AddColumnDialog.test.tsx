import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkbookStore } from '@/state/workbookStore';

import { AddColumnDialog } from './AddColumnDialog';

function renderDialog() {
  render(<AddColumnDialog open onOpenChange={() => undefined} sheet="survey" />);
}

async function chooseHeader(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('add-column-select'));
  await user.click(await screen.findByRole('option', { name }));
}

describe('AddColumnDialog (Task 2.6)', () => {
  beforeEach(() => {
    useWorkbookStore.getState().newWorkbook();
  });

  it('adds a known XLSForm header from the select', async () => {
    renderDialog();
    await chooseHeader('required_message');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('add-column-confirm'));

    expect(useWorkbookStore.getState().data.survey.columns).toContain('required_message');
  });

  it('adds an arbitrary custom header from the custom input', async () => {
    renderDialog();
    await chooseHeader('Custom header…');

    const user = userEvent.setup();
    const input = screen.getByTestId('add-column-input');
    await user.type(input, 'my_custom_header{Enter}');

    expect(useWorkbookStore.getState().data.survey.columns).toContain('my_custom_header');
  });

  it('keeps the empty and duplicate validation', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('add-column-confirm'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a column header.');

    await chooseHeader('Custom header…');
    await user.type(screen.getByTestId('add-column-input'), 'label');
    await user.click(screen.getByTestId('add-column-confirm'));

    expect(screen.getByRole('alert')).toHaveTextContent('"label" already exists in this sheet.');
    expect(
      useWorkbookStore.getState().data.survey.columns.filter((key) => key === 'label'),
    ).toHaveLength(1);
  });
});
