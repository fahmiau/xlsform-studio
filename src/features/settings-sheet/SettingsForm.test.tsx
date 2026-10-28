import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { SettingsForm } from './SettingsForm';

function loadSettings() {
  const data = createEmptyWorkbook();
  data.settings.columns.push('custom_key');
  data.settings.rows = [
    createRow({
      form_title: 'Old title',
      form_id: 'household',
      default_language: 'English (en)',
      custom_key: 'custom value',
    }),
  ];
  data.survey.columns.push('label::English (en)', 'label::Indonesian (id)');
  useWorkbookStore.getState().load(data);
}

describe('SettingsForm (Task 2.7)', () => {
  beforeEach(loadSettings);

  it('edits a known setting through one undoable action', () => {
    render(<SettingsForm />);
    const input = screen.getByTestId('setting-form_title');
    expect(input).toHaveValue('Old title');

    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.blur(input);

    expect(useWorkbookStore.getState().data.settings.rows[0]?.cells.form_title).toBe('New title');
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);

    useWorkbookStore.temporal.getState().undo();
    expect(useWorkbookStore.getState().data.settings.rows[0]?.cells.form_title).toBe('Old title');
  });

  it('shows discovered languages and commits a default-language choice', async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);
    const trigger = screen.getByTestId('setting-default_language');
    expect(trigger).toHaveAttribute('role', 'combobox');
    expect(trigger).toHaveTextContent('English (en)');

    await user.click(trigger);
    expect(await screen.findByRole('option', { name: 'English (en)' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Indonesian (id)' }));

    expect(useWorkbookStore.getState().data.settings.rows[0]?.cells.default_language).toBe(
      'Indonesian (id)',
    );
  });

  it('clears the default language through the (none) sentinel', async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    await user.click(screen.getByTestId('setting-default_language'));
    await user.click(await screen.findByRole('option', { name: '(none)' }));

    expect(
      useWorkbookStore.getState().data.settings.rows[0]?.cells.default_language,
    ).toBeUndefined();
    expect(screen.getByTestId('setting-default_language')).toHaveTextContent('(none)');
  });

  it('renders and edits custom keys', () => {
    render(<SettingsForm />);
    const input = screen.getByTestId('setting-custom_key');
    expect(input).toHaveValue('custom value');
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(useWorkbookStore.getState().data.settings.rows[0]?.cells.custom_key).toBe('changed');
  });

  it('does not write a setting when the value is unchanged', () => {
    render(<SettingsForm />);
    const input = screen.getByTestId('setting-form_title');
    fireEvent.blur(input);
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
