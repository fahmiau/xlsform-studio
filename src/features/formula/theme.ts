/** Light/dark CodeMirror themes matching the app palette (Task 4.4). */
import { EditorView } from '@codemirror/view';

export interface FormulaTheme {
  dark: boolean;
  variable: string;
  string: string;
  keyword: string;
  function: string;
  number: string;
  path: string;
  operator: string;
  error: string;
  text: string;
  background: string;
  border: string;
  selection: string;
}

export function formulaTheme(dark: boolean): FormulaTheme {
  return dark
    ? {
        dark: true,
        variable: '#67e8f9',
        string: '#86efac',
        keyword: '#c4b5fd',
        function: '#fbbf24',
        number: '#fca5a5',
        path: '#93c5fd',
        operator: '#cbd5e1',
        error: '#f87171',
        text: '#e2e8f0',
        background: '#0f172a',
        border: 'rgba(148, 163, 184, 0.35)',
        selection: 'rgba(129, 140, 248, 0.35)',
      }
    : {
        dark: false,
        variable: '#0e7490',
        string: '#15803d',
        keyword: '#7c3aed',
        function: '#b45309',
        number: '#b91c1c',
        path: '#1d4ed8',
        operator: '#334155',
        error: '#dc2626',
        text: '#0f172a',
        background: '#ffffff',
        border: 'rgba(100, 116, 139, 0.35)',
        selection: 'rgba(79, 70, 229, 0.22)',
      };
}

export function xlsformTheme(dark: boolean) {
  const palette = formulaTheme(dark);
  return EditorView.theme(
    {
      '&': {
        color: palette.text,
        backgroundColor: palette.background,
        fontSize: '12px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        lineHeight: '1.45',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '3px 4px',
        caretColor: palette.text,
      },
      '.cm-line': {
        padding: '0',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: palette.selection,
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: palette.text,
      },
      '.cm-tooltip': {
        backgroundColor: palette.background,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: '4px',
        fontSize: '11px',
      },
      '.cm-tooltip.cm-completionInfo': {
        padding: '4px 6px',
        maxWidth: '280px',
      },
      '.cm-xls-var': { color: palette.variable },
      '.cm-xls-string': { color: palette.string },
      '.cm-xls-keyword': { color: palette.keyword, fontWeight: '600' },
      '.cm-xls-func': { color: palette.function },
      '.cm-xls-number': { color: palette.number },
      '.cm-xls-path': { color: palette.path },
      '.cm-xls-op': { color: palette.operator },
      '.cm-xls-error': {
        color: palette.error,
        textDecoration: 'underline wavy',
        textDecorationColor: palette.error,
      },
      '.cm-xls-signature': {
        padding: '4px 6px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      '.cm-xls-signature-active': {
        fontWeight: '700',
        textDecoration: 'underline',
      },
      '.cm-xls-signature-doc': {
        marginTop: '2px',
        opacity: '0.8',
        fontFamily: 'inherit',
      },
      '.cm-xls-completion-label': { opacity: '0.7', marginLeft: '6px' },
      '.cm-xls-completion-warning': { color: palette.function, marginLeft: '6px' },
      '.cm-lintRange-error': {
        textDecoration: 'underline wavy',
        textDecorationColor: palette.error,
      },
      '.cm-lintRange-warning': {
        textDecoration: 'underline dotted',
        textDecorationColor: palette.function,
      },
    },
    { dark },
  );
}
