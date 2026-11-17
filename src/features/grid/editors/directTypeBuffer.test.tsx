import { StrictMode } from 'react';
import { GridCellKind, getDefaultTheme, type TextCell } from '@glideapps/glide-data-grid';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDirectTypeController, DirectTypeProvider } from './directTypeBuffer';
import { TextCellEditor } from './TextCellEditor';

function keyEvent(
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    altKey: mods.altKey ?? false,
    shiftKey: mods.shiftKey ?? false,
  };
}

function makeTextCell(data = 'old'): TextCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: data,
    allowOverlay: true,
    readonly: false,
  };
}

describe('directTypeBuffer', () => {
  it('buffers keys before mount, preserves peek across StrictMode renders, and clears on consume', () => {
    const controller = createDirectTypeController();
    controller.start([2, 1], 'a');
    expect(controller.isActive()).toBe(true);
    expect(controller.isActiveFor([2, 1])).toBe(true);
    expect(controller.isActiveFor([1, 1])).toBe(false);

    expect(controller.pushKey(keyEvent('g'))).toBe(true);
    expect(controller.pushKey(keyEvent('x'))).toBe(true);
    expect(controller.pushKey(keyEvent('Backspace'))).toBe(true);
    expect(controller.pushKey(keyEvent('e'))).toBe(true);

    expect(controller.peekText('a')).toBe('age');
    expect(controller.peekText('a')).toBe('age');

    expect(controller.consume()).toEqual({ cell: [2, 1], text: 'age' });
    expect(controller.isActive()).toBe(false);
    expect(controller.peekText('fallback')).toBe('fallback');
  });

  it('captures trailing commit/cancel actions and clears on modifier shortcuts', () => {
    const controller = createDirectTypeController();
    controller.start([1, 0], 'x');
    controller.pushKey(keyEvent('y'));
    controller.pushKey(keyEvent('Enter'));
    controller.pushKey(keyEvent('z'));
    expect(controller.consume()).toEqual({ cell: [1, 0], text: 'xy', trailingAction: 'enter' });

    controller.start([1, 0], 'q');
    expect(controller.pushKey(keyEvent('z', { ctrlKey: true }))).toBe(false);
    expect(controller.isActive()).toBe(false);
  });

  it('seeds TextCellEditor with all buffered keys under StrictMode', () => {
    const controller = createDirectTypeController();
    controller.start([2, 1], 'a');
    for (const ch of 'ge_direct') {
      controller.pushKey(keyEvent(ch));
    }

    const onChange = vi.fn();
    const onFinishedEditing = vi.fn();
    render(
      <StrictMode>
        <DirectTypeProvider controller={controller}>
          <TextCellEditor
            value={makeTextCell('a')}
            initialValue="a"
            onChange={onChange}
            onFinishedEditing={onFinishedEditing}
            isHighlighted={false}
            target={{ x: 0, y: 0, width: 100, height: 34 }}
            forceEditMode
            theme={getDefaultTheme()}
          />
        </DirectTypeProvider>
      </StrictMode>,
    );

    const editor = screen.getByTestId('text-cell-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('age_direct');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ data: 'age_direct' });
    expect(onFinishedEditing).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it('commits buffered text with [0, 0] if Enter arrived before mount', () => {
    const controller = createDirectTypeController();
    controller.start([2, 1], 'a');
    controller.pushKey(keyEvent('b'));
    controller.pushKey(keyEvent('Enter'));

    const onFinishedEditing = vi.fn();
    render(
      <StrictMode>
        <DirectTypeProvider controller={controller}>
          <TextCellEditor
            value={makeTextCell('a')}
            initialValue="a"
            onChange={vi.fn()}
            onFinishedEditing={onFinishedEditing}
            isHighlighted={false}
            target={{ x: 0, y: 0, width: 100, height: 34 }}
            forceEditMode
            theme={getDefaultTheme()}
          />
        </DirectTypeProvider>
      </StrictMode>,
    );

    expect(onFinishedEditing).toHaveBeenCalledTimes(1);
    expect(onFinishedEditing).toHaveBeenCalledWith(expect.objectContaining({ data: 'ab' }), [0, 0]);
  });
});
