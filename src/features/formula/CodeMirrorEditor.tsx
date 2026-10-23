/** React host shared by the formula bar and the in-cell XPath editor. */
import { useEffect, useRef } from 'react';
import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { forceLinting } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, type KeyBinding } from '@codemirror/view';

import type { DiagnosticIssue } from '@/core/lint';
import { AUTOCOMPLETE_EVENT } from '@/lib/commands';
import { useDerivedStore } from '@/state/derivedStore';

import { baseExtensions } from './baseExtensions';
import { makeCompletionSource, type CompletionData } from './completions';
import { makeLintExtension } from './lintExtension';
import { signatureHelp } from './signatureHelp';

const EMPTY_COMPLETION_DATA: CompletionData = {
  variableMap: { variables: {}, duplicates: {}, order: [] },
  choicesByList: {},
  choiceNameKey: 'name',
};

export interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  onCancel?: () => void;
  /** False for plain-text columns (labels, hints, …). */
  xpath?: boolean;
  dark: boolean;
  completionData?: () => CompletionData;
  lintIssues?: () => readonly DiagnosticIssue[];
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Commit on Tab with the movement [1, 0] (in-cell grid editor). */
  commitOnTab?: boolean;
  onTabCommit?: (value: string) => void;
  testId?: string;
  /** Typing triggers completions (Preferences → Editor). */
  autocomplete?: boolean;
  /** Formula font size (Preferences → Editor). */
  fontSize?: number;
}

export function CodeMirrorEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  xpath = false,
  dark,
  completionData,
  lintIssues,
  autoFocus = false,
  ariaLabel,
  className,
  commitOnTab = false,
  onTabCommit,
  testId,
  autocomplete = true,
  fontSize = 12,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const syncing = useRef(false);
  const callbacks = useRef({
    onChange,
    onCommit,
    onCancel,
    onTabCommit,
    completionData,
    lintIssues,
  });
  useEffect(() => {
    callbacks.current = { onChange, onCommit, onCancel, onTabCommit, completionData, lintIssues };
  });
  const diagnostics = useDerivedStore((state) => state.diagnostics);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const commit = (view: EditorView) => {
      callbacks.current.onCommit?.(view.state.doc.toString());
    };
    const bindings: KeyBinding[] = [
      {
        key: 'Enter',
        run: (view) => {
          commit(view);
          return true;
        },
      },
      {
        key: 'Shift-Enter',
        run: () => false,
      },
      {
        key: 'Escape',
        run: () => {
          callbacks.current.onCancel?.();
          return true;
        },
      },
      {
        key: 'Mod-Space',
        run: startCompletion,
      },
    ];
    if (commitOnTab) {
      bindings.push({
        key: 'Tab',
        run: (view) => {
          callbacks.current.onTabCommit?.(view.state.doc.toString());
          return true;
        },
      });
    }

    const extensions: Extension[] = [
      baseExtensions({
        dark,
        ariaLabel: ariaLabel ?? 'Formula editor',
        keymap: bindings,
        fontSize,
      }),
    ];
    if (xpath) {
      extensions.push(
        autocompletion({
          override: [
            makeCompletionSource(
              () => callbacks.current.completionData?.() ?? EMPTY_COMPLETION_DATA,
            ),
          ],
          activateOnTyping: autocomplete,
          defaultKeymap: false,
        }),
        signatureHelp(() => callbacks.current.completionData?.() ?? EMPTY_COMPLETION_DATA),
      );
      extensions.push(
        makeLintExtension(() => callbacks.current.lintIssues?.() ?? [], { delay: 50 }),
      );
    }
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || syncing.current) return;
        callbacks.current.onChange?.(update.state.doc.toString());
      }),
    );

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host,
    });
    viewRef.current = view;
    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: value.length } });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // `value` is intentionally not a dependency: external updates are synced
    // by the effect below so remounting does not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ariaLabel, autoFocus, autocomplete, commitOnTab, dark, fontSize, xpath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    syncing.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: Math.min(value.length, view.state.selection.main.head) },
      });
    } finally {
      syncing.current = false;
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) forceLinting(view);
  }, [diagnostics]);

  // `Ctrl+Space` is a global command; the focused editor opens completions.
  useEffect(() => {
    const onAutocomplete = () => {
      const view = viewRef.current;
      if (view?.hasFocus) startCompletion(view);
    };
    window.addEventListener(AUTOCOMPLETE_EVENT, onAutocomplete);
    return () => window.removeEventListener(AUTOCOMPLETE_EVENT, onAutocomplete);
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
          // Keep grid navigation from seeing keys the editor already handled.
          event.stopPropagation();
        }
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        callbacks.current.onCommit?.(viewRef.current?.state.doc.toString() ?? value);
      }}
    />
  );
}
