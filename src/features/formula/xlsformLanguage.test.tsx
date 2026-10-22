import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { templateBraceTransaction } from './baseExtensions';
import { buildDecorations, XLSFORM_CLASS, xlsformHighlighting } from './xlsformLanguage';
import { xlsformTheme } from './theme';

function mount(doc: string): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    doc,
    parent: host,
    extensions: [xlsformHighlighting, xlsformTheme(false)],
  });
}

function textOf(view: EditorView, selector: string): string[] {
  return [...view.dom.querySelectorAll(selector)].map((node) => node.textContent ?? '');
}

describe('XLSForm CodeMirror language (Task 4.4)', () => {
  it('renders all four PRD color classes', () => {
    const view = mount("(${respondent_age} >= 18) and selected(${marital_status}, 'married')");
    expect(textOf(view, `.${XLSFORM_CLASS.variable}`)).toEqual([
      '${respondent_age}',
      '${marital_status}',
    ]);
    expect(textOf(view, `.${XLSFORM_CLASS.keyword}`)).toEqual(['and']);
    expect(textOf(view, `.${XLSFORM_CLASS.function}`)).toEqual(['selected']);
    expect(textOf(view, `.${XLSFORM_CLASS.string}`)).toEqual(["'married'"]);
    view.destroy();
  });

  it('marks an unbalanced parenthesis red', () => {
    const view = mount('(a');
    expect(textOf(view, `.${XLSFORM_CLASS.error}`)).toEqual(['(']);
    view.destroy();
  });

  it('marks unclosed strings and variable braces red', () => {
    const view = mount("'unclosed and ${var");
    expect(textOf(view, `.${XLSFORM_CLASS.error}`)).toEqual(["'unclosed and ${var"]);
    view.destroy();
  });

  it('builds decorations without gaps for adjacent tokens', () => {
    const decorations = buildDecorations('${a}and${b}');
    const ranges: Array<[number, number]> = [];
    decorations.between(0, 100, (from, to) => {
      ranges.push([from, to]);
    });
    expect(ranges).toEqual([
      [0, 4],
      [4, 7],
      [7, 11],
    ]);
  });

  it('auto-closes ${ with the cursor inside', () => {
    const state = EditorState.create({ doc: '$' });
    const transaction = templateBraceTransaction(state, 1, 1, '{');
    expect(transaction).not.toBeNull();
    const next = state.update(transaction!);
    expect(next.state.doc.toString()).toBe('${}');
    expect(next.state.selection.main.head).toBe(2);
    expect(templateBraceTransaction(state, 1, 1, 'x')).toBeNull();
    expect(templateBraceTransaction(EditorState.create({ doc: 'a' }), 1, 1, '{')).toBeNull();
    expect(templateBraceTransaction(state, 0, 1, '{')).toBeNull();
  });
});
