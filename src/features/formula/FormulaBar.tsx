/**
 * Formula bar (Tasks 2.2 / 4.6). XPath columns get the full CodeMirror IDE;
 * other columns keep a lightweight native input for long labels and hints.
 *
 * `Enter` commits one store action, `Shift+Enter` inserts a newline in the
 * CodeMirror editor, and `Esc` reverts. Edits preview live in the grid through
 * `uiStore.cellPreview` and only enter undo history on commit.
 */
import { useState } from 'react';

import { findColumnKey } from '@/core/indexes/columns';
import { resolveColumn } from '@/core/model/columns';
import { modeFromStyle } from '@/core/slug/slugify';
import { diagnosticCellKey } from '@/core/lint/diagnostics';
import { isCellEditable } from '@/features/grid/editability';
import { applyCellEdits, type CellEditOutcome } from '@/features/grid/cellEditPipeline';
import { notifyCellEdits } from '@/features/shell/toasts';
import { useIsDark } from '@/lib/theme';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore, type CellRef } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { CodeMirrorEditor } from './CodeMirrorEditor';
import { completionDataFor } from './completions';

export function FormulaBar() {
  const activeCell = useUiStore((state) => state.activeCell);
  const data = useWorkbookStore((state) => state.data);
  const theme = usePrefsStore((state) => state.theme);
  const autocompleteOnDollar = usePrefsStore((state) => state.autocompleteOnDollar);
  const formulaFontSize = usePrefsStore((state) => state.formulaFontSize);
  const dark = useIsDark(theme);

  const sheet = activeCell ? data[activeCell.sheet] : null;
  const row = activeCell
    ? sheet?.rows.find((candidate) => candidate.id === activeCell.rowId)
    : null;
  const value = activeCell && row ? (row.cells[activeCell.column] ?? '') : '';
  const typeKey = sheet ? (findColumnKey(sheet, 'type') ?? 'type') : 'type';
  const editable = activeCell
    ? isCellEditable(row?.cells[typeKey] ?? '', activeCell.column)
    : false;
  const xpath = activeCell !== null && editable && resolveColumn(activeCell.column).isXPath;

  const commit = (draft: string) => {
    if (!activeCell || !editable) return;
    useUiStore.getState().setCellPreview(null);
    if (draft === value) return;
    const { slugMaxLength, defaultSlugMode, listNamePattern } = usePrefsStore.getState();
    const { choiceModes } = useUiStore.getState();
    let outcome: CellEditOutcome | undefined;
    useWorkbookStore.getState().apply(
      `Edit ${resolveColumn(activeCell.column).canonical}`,
      (current) => {
        const edit = { rowId: activeCell.rowId, column: activeCell.column, value: draft };
        outcome = applyCellEdits(current, activeCell.sheet, [edit], {
          maxLength: slugMaxLength,
          choiceModes,
          defaultMode: modeFromStyle(defaultSlugMode),
          listNamePattern,
        });
        return outcome.data;
      },
      { sheet: activeCell.sheet, rowIds: [activeCell.rowId] },
    );
    if (outcome) notifyCellEdits(outcome);
  };

  const revert = () => {
    useUiStore.getState().setCellPreview(null);
  };

  const preview = (draft: string) => {
    if (!activeCell || !editable) return;
    useUiStore.getState().setCellPreview({
      sheet: activeCell.sheet,
      rowId: activeCell.rowId,
      column: activeCell.column,
      value: draft,
    });
  };

  return (
    <div className="flex items-center gap-2 border-b px-3 py-1" data-testid="formula-bar">
      <span className="text-muted-foreground font-mono text-xs italic">fx</span>
      {xpath && activeCell ? (
        <XPathFormulaInput
          key={`${activeCell.sheet}:${activeCell.rowId}:${activeCell.column}`}
          cell={activeCell}
          value={value}
          dark={dark}
          autocomplete={autocompleteOnDollar}
          fontSize={formulaFontSize}
          onChange={preview}
          onCommit={commit}
          onCancel={revert}
        />
      ) : (
        <PlainFormulaInput
          key={`${activeCell?.rowId ?? ''}:${activeCell?.column ?? ''}:${value}`}
          value={value}
          enabled={Boolean(activeCell)}
          editable={editable}
          fontSize={formulaFontSize}
          onCommit={commit}
        />
      )}
      <span className="text-muted-foreground shrink-0 text-xs" data-testid="formula-bar-column">
        {activeCell ? `[Column: ${resolveColumn(activeCell.column).canonical}]` : '[Column: —]'}
      </span>
    </div>
  );
}

function XPathFormulaInput({
  cell,
  value,
  dark,
  autocomplete,
  fontSize,
  onChange,
  onCommit,
  onCancel,
}: {
  cell: CellRef;
  value: string;
  dark: boolean;
  autocomplete: boolean;
  fontSize: number;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <CodeMirrorEditor
      value={value}
      xpath
      dark={dark}
      autocomplete={autocomplete}
      fontSize={fontSize}
      ariaLabel="Formula bar"
      className="border-input bg-background min-h-7 min-w-0 flex-1 overflow-hidden rounded border"
      testId="formula-bar-editor"
      onChange={onChange}
      onCommit={onCommit}
      onCancel={onCancel}
      completionData={() =>
        completionDataFor(
          useWorkbookStore.getState().data,
          useDerivedStore.getState().indexes,
          cell,
        )
      }
      lintIssues={() =>
        useDerivedStore
          .getState()
          .diagnosticIndex.byCell.get(diagnosticCellKey(cell.rowId, cell.column)) ?? []
      }
    />
  );
}

function PlainFormulaInput({
  value,
  enabled,
  editable,
  fontSize,
  onCommit,
}: {
  value: string;
  enabled: boolean;
  editable: boolean;
  fontSize: number;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      className="border-input bg-background focus-visible:ring-ring min-w-0 flex-1 rounded border px-2 py-0.5 font-mono text-xs focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
      style={{ fontSize }}
      data-testid="formula-bar-input"
      value={enabled ? draft : ''}
      disabled={!enabled || !editable}
      placeholder={enabled ? '' : 'Select a cell'}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft);
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function FormulaBarSlot() {
  return <FormulaBar />;
}
