import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from '@/core/model/factory';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { FormulaBar } from './FormulaBar';

function loadForm(relevant = '') {
  const data = createEmptyWorkbook();
  data.survey.rows = [
    { id: 's1', cells: { type: 'text', name: 'q1', label: 'Q1', relevant } },
    { id: 's2', cells: { type: 'integer', name: 'q2', label: 'Q2' } },
  ];
  useWorkbookStore.getState().load(data);
  useWorkbookStore.temporal.getState().clear();
  useDerivedStore.getState().rebuild();
  useUiStore.getState().setActiveSheet('survey');
  useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's1', column: 'relevant' });
}

function cellValue(): string {
  return useWorkbookStore.getState().data.survey.rows[0]?.cells.relevant ?? '';
}

beforeEach(() => {
  useUiStore.getState().setCellPreview(null);
  usePrefsStore.getState().update({ listNamePattern: '{name}' });
  loadForm();
});

describe('FormulaBar XPath editor (Task 4.6)', () => {
  it('mounts CodeMirror for an XPath column and previews edits', () => {
    render(<FormulaBar />);
    expect(screen.getByTestId('formula-bar-column')).toHaveTextContent('[Column: relevant]');
    const host = screen.getByTestId('formula-bar-editor');
    const view = EditorView.findFromDOM(host);
    expect(view).not.toBeNull();

    act(() => {
      view!.dispatch({ changes: { from: 0, to: 0, insert: '${q1}' } });
    });
    expect(useUiStore.getState().cellPreview?.value).toBe('${q1}');
    expect(cellValue()).toBe('');
  });

  it('commits on Enter as one undo step', () => {
    render(<FormulaBar />);
    const view = EditorView.findFromDOM(screen.getByTestId('formula-bar-editor'));
    act(() => {
      view!.dispatch({ changes: { from: 0, to: 0, insert: '${q1}' } });
    });
    fireEvent.keyDown(view!.contentDOM, { key: 'Enter', code: 'Enter' });

    expect(cellValue()).toBe('${q1}');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useUiStore.getState().cellPreview).toBeNull();

    act(() => useWorkbookStore.temporal.getState().undo());
    expect(cellValue()).toBe('');
  });

  it('reverts on Escape without touching the document', () => {
    render(<FormulaBar />);
    const view = EditorView.findFromDOM(screen.getByTestId('formula-bar-editor'));
    act(() => {
      view!.dispatch({ changes: { from: 0, to: 0, insert: '${q2}' } });
    });
    fireEvent.keyDown(view!.contentDOM, { key: 'Escape', code: 'Escape' });
    expect(cellValue()).toBe('');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useUiStore.getState().cellPreview).toBeNull();
  });

  it('falls back to a plain input for non-XPath columns', () => {
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's1', column: 'label' });
    render(<FormulaBar />);
    expect(screen.getByTestId('formula-bar-input')).toHaveValue('Q1');
    expect(screen.queryByTestId('formula-bar-editor')).not.toBeInTheDocument();
  });

  it('uses the same fixed height for XPath and plain columns', () => {
    render(<FormulaBar />);
    const host = screen.getByTestId('formula-bar-editor');
    expect(host).toHaveClass('h-8');
    expect(host.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(false);

    act(() => {
      useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's1', column: 'label' });
    });
    expect(screen.getByTestId('formula-bar-input')).toHaveClass('h-8');
  });

  it('uses the same fixed height in the disabled state', () => {
    useUiStore.getState().setActiveCell(null);
    render(<FormulaBar />);
    expect(screen.getByTestId('formula-bar-input')).toHaveClass('h-8');
    expect(screen.getByTestId('formula-bar-input')).toBeDisabled();
  });

  it('auto-binds a list with the current name pattern (Task 5.7/3.3)', () => {
    usePrefsStore.getState().update({ listNamePattern: '{name}_list' });
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's2', column: 'type' });
    render(<FormulaBar />);

    const input = screen.getByTestId('formula-bar-input');
    fireEvent.change(input, { target: { value: 'select_one' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useWorkbookStore.getState().data.survey.rows[1]?.cells.type).toBe('select_one q2_list');
  });

  it('blurs the XPath editor on Enter and Escape without double-committing canceled text', () => {
    loadForm('${q1} > 0');
    render(<FormulaBar />);
    const view = EditorView.findFromDOM(screen.getByTestId('formula-bar-editor'));
    expect(view).not.toBeNull();

    act(() => {
      view!.focus();
      view!.dispatch({ changes: { from: 0, to: view!.state.doc.length, insert: '' } });
    });
    fireEvent.keyDown(view!.contentDOM, { key: 'Enter', code: 'Enter' });
    expect(cellValue()).toBe('');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    expect(view!.contentDOM).not.toHaveFocus();

    // Typing and pressing Escape must revert, blur, and not re-commit on blur.
    act(() => {
      view!.focus();
      view!.dispatch({ changes: { from: 0, to: view!.state.doc.length, insert: '${q2}' } });
    });
    fireEvent.keyDown(view!.contentDOM, { key: 'Escape', code: 'Escape' });
    expect(cellValue()).toBe('');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(1);
    expect(view!.contentDOM).not.toHaveFocus();
  });

  it('reverts a plain formula input on Escape without committing on blur', () => {
    useUiStore.getState().setActiveCell({ sheet: 'survey', rowId: 's1', column: 'label' });
    render(<FormulaBar />);
    const input = screen.getByTestId('formula-bar-input');
    input.focus();
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.label).toBe('Q1');
    expect(useWorkbookStore.temporal.getState().pastStates).toHaveLength(0);
    expect(input).not.toHaveFocus();
  });
});
