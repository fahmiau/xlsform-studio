import { currentCompletions, setSelectedCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeMirrorEditor } from './CodeMirrorEditor';
import type { CompletionData } from './completions';

const COMPLETION_DATA: CompletionData = {
  variableMap: { variables: {}, duplicates: {}, order: [] },
  choicesByList: {},
  choiceNameKey: 'name',
};

function renderEditor(onCommit: (value: string) => void): EditorView {
  render(
    <CodeMirrorEditor
      value=""
      xpath
      autoFocus
      dark={false}
      testId="completion-editor"
      completionData={() => COMPLETION_DATA}
      onCommit={onCommit}
    />,
  );
  const view = EditorView.findFromDOM(screen.getByTestId('completion-editor'));
  if (!view) throw new Error('CodeMirror view missing');
  return view;
}

async function openFunctionCompletion(view: EditorView): Promise<void> {
  view.dispatch({
    changes: { from: 0, insert: 'if' },
    selection: { anchor: 2 },
    userEvent: 'input.type',
  });
  await waitFor(() => {
    expect(document.querySelector('.cm-tooltip-autocomplete')).not.toBeNull();
  });
  const index = currentCompletions(view.state).findIndex((option) => option.label === 'if');
  expect(index).toBeGreaterThanOrEqual(0);
  view.dispatch({ effects: setSelectedCompletion(index) });
  // `acceptCompletion` ignores keys until the 75 ms interaction delay passes.
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('CodeMirrorEditor completion acceptance', () => {
  it('accepts the highlighted completion with Enter, then commits on the next Enter', async () => {
    const onCommit = vi.fn();
    const view = renderEditor(onCommit);
    await openFunctionCompletion(view);

    fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('if()');
    expect(view.state.selection.main.head).toBe(3);

    fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('if()');
  });
});
