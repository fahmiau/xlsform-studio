import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { useWorkbookStore } from '@/state/workbookStore';

import { makeEnumCell } from '../cells/EnumCell';
import { TypeEditor } from './TypeEditor';

function setup(type = 'text', name = 'water_source', withLists = true) {
  const data = createEmptyWorkbook();
  data.survey.rows.push(createRow({ type, name, label: 'Water source' }));
  if (withLists) {
    data.choices.rows.push(
      createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
      createRow({ list_name: 'yes_no', name: 'no', label: 'No' }),
      createRow({ list_name: 'region', name: 'north', label: 'North' }),
    );
  }
  useWorkbookStore.getState().load(data);
  const rowId = data.survey.rows[0]!.id;
  const value = makeEnumCell({ column: 'type', value: type, rowId });
  const onChange = vi.fn();
  const onFinishedEditing = vi.fn();
  render(
    <TypeEditor
      value={value}
      onChange={onChange}
      onFinishedEditing={onFinishedEditing}
      isHighlighted={false}
      target={{ x: 0, y: 0, width: 100, height: 30 }}
      forceEditMode
      theme={{} as never}
    />,
  );
  return { onChange, onFinishedEditing, input: screen.getByTestId('type-editor-input') };
}

beforeEach(() => {
  useWorkbookStore.getState().newWorkbook();
});

describe('TypeEditor (Task 3.1)', () => {
  it('fuzzy-finds select_one from "sel1" and moves to the list step', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.clear(input);
    await user.type(input, 'sel1');
    expect(screen.getByText('select_one')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByText('yes_no')).toBeInTheDocument();
    expect(screen.getByTestId('create-list-option')).toBeInTheDocument();
  });

  it('commits an existing list with the base type', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.type(input, 'sel1{Enter}');
    await user.click(screen.getByText('yes_no'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.data.value).toBe('select_one yes_no');
  });

  it('creates a list from the question name', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup('text', 'water_source', false);
    await user.type(input, 'sel1{Enter}');
    const create = screen.getByTestId('create-list-option');
    expect(create).toHaveTextContent('water_source');
    await user.click(create);
    expect(onChange.mock.calls[0]?.[0]?.data.value).toBe('select_one water_source');
  });

  it('appends or_other when requested', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.type(input, 'sel1{Enter}');
    await user.click(screen.getByTestId('or-other-checkbox'));
    await user.click(screen.getByText('yes_no'));
    expect(onChange.mock.calls[0]?.[0]?.data.value).toBe('select_one yes_no or_other');
  });

  it('accepts unknown raw types', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.clear(input);
    await user.type(input, 'custom_widget');
    await user.keyboard('{Enter}');
    expect(onChange.mock.calls[0]?.[0]?.data.value).toBe('custom_widget');
  });

  it('commits and moves right on Tab', async () => {
    const user = userEvent.setup();
    const { input, onFinishedEditing } = setup();
    await user.type(input, 'integer');
    await user.keyboard('{Tab}');
    expect(onFinishedEditing).toHaveBeenCalledWith(
      expect.objectContaining({ copyData: 'integer' }),
      [1, 0],
    );
  });
});
