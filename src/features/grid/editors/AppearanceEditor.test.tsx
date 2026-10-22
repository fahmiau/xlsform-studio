import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { useWorkbookStore } from '@/state/workbookStore';

import { makeEnumCell } from '../cells/EnumCell';
import { AppearanceEditor } from './AppearanceEditor';

function setup(type: string) {
  const data = createEmptyWorkbook();
  data.survey.rows.push(createRow({ type, name: 'q1', label: 'Question' }));
  useWorkbookStore.getState().load(data);
  const rowId = data.survey.rows[0]!.id;
  const onChange = vi.fn();
  render(
    <AppearanceEditor
      value={makeEnumCell({ column: 'appearance', value: '', rowId, baseType: type })}
      onChange={onChange}
      onFinishedEditing={vi.fn()}
      isHighlighted={false}
      target={{ x: 0, y: 0, width: 100, height: 30 }}
      forceEditMode
      theme={{} as never}
    />,
  );
  return { onChange, input: screen.getByTestId('appearance-editor-input') };
}

beforeEach(() => {
  useWorkbookStore.getState().newWorkbook();
});

describe('AppearanceEditor (Task 3.1)', () => {
  it('filters suggestions by the row type', () => {
    setup('date');
    expect(screen.getByText('month-year')).toBeInTheDocument();
    expect(screen.queryByText('multiline')).not.toBeInTheDocument();
  });

  it('commits a suggestion and keeps the base type', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup('date');
    await user.type(input, 'month-year');
    await user.keyboard('{Enter}');
    expect(onChange.mock.calls[0]?.[0]?.data).toMatchObject({
      value: 'month-year',
      baseType: 'date',
      column: 'appearance',
    });
  });

  it('accepts raw appearances for later linting', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup('integer');
    await user.type(input, 'my-custom-appearance');
    await user.keyboard('{Enter}');
    expect(onChange.mock.calls[0]?.[0]?.data.value).toBe('my-custom-appearance');
  });
});
