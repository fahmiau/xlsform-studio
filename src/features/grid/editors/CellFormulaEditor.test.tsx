import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { getDefaultTheme } from '@glideapps/glide-data-grid';
import { describe, expect, it, vi } from 'vitest';

import { makeXPathCell } from '../cells/XPathCell';
import { CellFormulaEditor } from './CellFormulaEditor';
import { useEditorRouting } from './useEditorRouting';

const baseProps = {
  isHighlighted: false,
  target: { x: 0, y: 0, width: 0, height: 0 },
  theme: getDefaultTheme(),
  forceEditMode: true,
};

function editorValue(value = "selected(${marital_status}, 'married')") {
  return makeXPathCell({
    value,
    rowId: 's1',
    column: 'relevant',
  });
}

describe('CellFormulaEditor (Task 4.6)', () => {
  it('commits on Enter', () => {
    const onFinishedEditing = vi.fn();
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue()}
        onChange={() => undefined}
        onFinishedEditing={onFinishedEditing}
      />,
    );
    const content = screen.getByTestId('cell-formula-editor').querySelector('.cm-content');
    expect(content).not.toBeNull();
    fireEvent.keyDown(content!, { key: 'Enter', code: 'Enter' });
    expect(onFinishedEditing).toHaveBeenCalledTimes(1);
    const cell = onFinishedEditing.mock.calls[0]?.[0];
    expect(cell?.data.value).toContain('marital_status');
  });

  it('cancels on Escape', () => {
    const onFinishedEditing = vi.fn();
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue('${a}')}
        onChange={() => undefined}
        onFinishedEditing={onFinishedEditing}
      />,
    );
    const content = screen.getByTestId('cell-formula-editor').querySelector('.cm-content');
    fireEvent.keyDown(content!, { key: 'Escape', code: 'Escape' });
    expect(onFinishedEditing).toHaveBeenCalledWith(undefined);
  });

  it('commits with a Tab movement', () => {
    const onFinishedEditing = vi.fn();
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue('${a}')}
        onChange={() => undefined}
        onFinishedEditing={onFinishedEditing}
      />,
    );
    const content = screen.getByTestId('cell-formula-editor').querySelector('.cm-content');
    fireEvent.keyDown(content!, { key: 'Tab', code: 'Tab' });
    expect(onFinishedEditing.mock.calls[0]?.[1]).toEqual([1, 0]);
  });

  it('is routed for XPath custom cells', () => {
    const { result } = renderHook(() => useEditorRouting());
    const provider = result.current(editorValue());
    expect(provider).toBeDefined();
    expect('editor' in provider!).toBe(true);
    if (provider && 'editor' in provider) {
      expect(provider.editor).toBe(CellFormulaEditor);
      expect(provider.disablePadding).toBe(true);
    }
  });
});
