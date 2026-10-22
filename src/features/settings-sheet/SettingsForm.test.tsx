import { fireEvent, render, screen } from '@testing-library/react';
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

  it('shows discovered languages in the default-language select', () => {
    render(<SettingsForm />);
    const select = screen.getByTestId('setting-default_language');
    expect(select).toHaveValue('English (en)');
    expect(screen.getByRole('option', { name: 'English (en)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Indonesian (id)' })).toBeInTheDocument();
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
