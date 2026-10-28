/** CodeMirror base setup shared by the formula bar and in-cell editor. */
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { EditorState, type Extension, type TransactionSpec } from '@codemirror/state';
import { drawSelection, EditorView, keymap, tooltips, type KeyBinding } from '@codemirror/view';

import { xlsformHighlighting } from './xlsformLanguage';
import { xlsformTheme } from './theme';

/** Close `(` and quotes; `${` is handled by the input handler below. */
const bracketLanguageData = EditorState.languageData.of(() => [
  { brackets: '()', closeBrackets: { brackets: ['(', "'", '"'] } },
]);

/**
 * Typing `{` directly after `$` produces `${}` with the cursor inside. This is
 * how the PRD's `${` auto-close behavior is implemented for a plain-text
 * language (CodeMirror's closeBrackets only knows single-character pairs).
 */
export function templateBraceTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): TransactionSpec | null {
  if (text !== '{' || from !== to) return null;
  if (state.sliceDoc(Math.max(0, from - 1), from) !== '$') return null;
  return {
    changes: { from, to, insert: '{}' },
    selection: { anchor: from + 1 },
    userEvent: 'input',
  };
}

const templateBraceInput = EditorView.inputHandler.of((view, from, to, text) => {
  const transaction = templateBraceTransaction(view.state, from, to, text);
  if (!transaction) return false;
  view.dispatch(transaction);
  return true;
});

export interface BaseExtensionsOptions {
  dark: boolean;
  /** Extra key bindings, tried before the defaults. */
  keymap?: readonly KeyBinding[];
  ariaLabel?: string;
  /** Render tooltips in `document.body` so Glide's overlay cannot clip them. */
  tooltipsInBody?: boolean;
  /** Formula font size from Preferences (default 12px). */
  fontSize?: number;
}

export function baseExtensions(options: BaseExtensionsOptions): Extension {
  const extensions: Extension[] = [
    history(),
    drawSelection(),
    bracketMatching(),
    closeBrackets(),
    bracketLanguageData,
    templateBraceInput,
    xlsformHighlighting,
    xlsformTheme(options.dark, options.fontSize),
    EditorState.allowMultipleSelections.of(false),
    keymap.of([
      ...(options.keymap ?? []),
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
  ];
  if (options.tooltipsInBody !== false) {
    extensions.push(tooltips({ parent: document.body }));
  }
  if (options.ariaLabel) {
    extensions.push(
      EditorView.contentAttributes.of({
        'aria-label': options.ariaLabel,
        spellcheck: 'false',
      }),
    );
  }
  return extensions;
}
