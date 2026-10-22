/**
 * XLSForm XPath highlighting for CodeMirror (Task 4.4, AD-9).
 *
 * Uses the shared tokenizer and a ViewPlugin decoration set rather than a
 * Lezer grammar: one tokenizer keeps the editor, linter, and refactoring in
 * agreement.
 */
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';

import { tokenize, type Token } from '@/core/xpath/tokenize';

export const XLSFORM_CLASS = {
  variable: 'cm-xls-var',
  string: 'cm-xls-string',
  keyword: 'cm-xls-keyword',
  function: 'cm-xls-func',
  number: 'cm-xls-number',
  path: 'cm-xls-path',
  operator: 'cm-xls-op',
  error: 'cm-xls-error',
} as const;

function className(token: Token): string | undefined {
  switch (token.kind) {
    case 'varRef':
      return XLSFORM_CLASS.variable;
    case 'string':
      return XLSFORM_CLASS.string;
    case 'keywordOp':
      return XLSFORM_CLASS.keyword;
    case 'func':
      return XLSFORM_CLASS.function;
    case 'number':
      return XLSFORM_CLASS.number;
    case 'path':
      return XLSFORM_CLASS.path;
    case 'op':
      return XLSFORM_CLASS.operator;
    default:
      return undefined;
  }
}

const marks = new Map<string, Decoration>();

function mark(classes: string): Decoration {
  let decoration = marks.get(classes);
  if (!decoration) {
    decoration = Decoration.mark({ class: classes });
    marks.set(classes, decoration);
  }
  return decoration;
}

export function buildDecorations(src: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const token of tokenize(src)) {
    const base = className(token);
    const classes = [base, token.error ? XLSFORM_CLASS.error : undefined].filter(Boolean).join(' ');
    if (!classes) continue;
    builder.add(token.from, token.to, mark(classes));
  }
  return builder.finish();
}

export const xlsformHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state.doc.toString());
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.state.doc.toString());
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
