import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { getDefaultTheme } from '@glideapps/glide-data-grid';
import { EditorView } from '@codemirror/view';
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

  it("seeds the document from Glide's initialValue", () => {
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue()}
        initialValue="$"
        onChange={() => undefined}
        onFinishedEditing={() => undefined}
      />,
    );
    const view = EditorView.findFromDOM(screen.getByTestId('cell-formula-editor'));
    expect(view?.state.doc.toString()).toBe('$');
  });

  it('falls back to the cell value when initialValue is undefined', () => {
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue('${a}')}
        onChange={() => undefined}
        onFinishedEditing={() => undefined}
      />,
    );
    const view = EditorView.findFromDOM(screen.getByTestId('cell-formula-editor'));
    expect(view?.state.doc.toString()).toBe('${a}');
    expect(view?.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
  });

  it('seeds the overlay once with the initial document, even in StrictMode', () => {
    const onChange = vi.fn();
    const onFinishedEditing = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <CellFormulaEditor
          {...baseProps}
          value={editorValue('')}
          initialValue="$"
          onChange={onChange}
          onFinishedEditing={onFinishedEditing}
        />
      </StrictMode>,
    );

    const view = EditorView.findFromDOM(screen.getByTestId('cell-formula-editor'));
    expect(view).not.toBeNull();
    expect(view?.state.doc.toString()).toBe('$');
    // StrictMode mounts effects twice; the ref guard must still seed only once.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].data.value).toBe('$');
    expect(onFinishedEditing).not.toHaveBeenCalled();

    unmount();
    expect(onFinishedEditing).not.toHaveBeenCalled();
  });

  it('does not commit when the host blurs (Glide owns outside-click finishing)', () => {
    const onFinishedEditing = vi.fn();
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue('')}
        initialValue="$"
        onChange={() => undefined}
        onFinishedEditing={onFinishedEditing}
      />,
    );

    // React maps onBlur to the bubbling focusout event, which is what fires
    // when StrictMode's double effect destroys the first CodeMirror view.
    fireEvent.focusOut(screen.getByTestId('cell-formula-editor'));
    expect(onFinishedEditing).not.toHaveBeenCalled();
  });

  it('tracks typed edits in onChange and commits the current document', () => {
    const onChange = vi.fn();
    const onFinishedEditing = vi.fn();
    render(
      <CellFormulaEditor
        {...baseProps}
        value={editorValue('')}
        initialValue="$"
        onChange={onChange}
        onFinishedEditing={onFinishedEditing}
      />,
    );

    const view = EditorView.findFromDOM(screen.getByTestId('cell-formula-editor'));
    if (!view) throw new Error('CodeMirror view missing');
    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: 'x' } });
    });
    expect(onChange.mock.calls.at(-1)?.[0].data.value).toBe('$x');

    fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter' });
    expect(onFinishedEditing).toHaveBeenCalledTimes(1);
    expect(onFinishedEditing.mock.calls[0]?.[0].data.value).toBe('$x');
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
