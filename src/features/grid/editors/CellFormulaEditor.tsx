/** In-cell CodeMirror formula editor (Task 4.6). */
import { useRef } from 'react';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { diagnosticCellKey } from '@/core/lint/diagnostics';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useIsDark } from '@/lib/theme';
import { useWorkbookStore } from '@/state/workbookStore';

import { CodeMirrorEditor } from '../../formula/CodeMirrorEditor';
import { completionDataFor } from '../../formula/completions';
import { makeXPathCell, type XPathCell } from '../cells/XPathCell';
import {
  actionMovement,
  useConsumeDirectType,
  useDirectTypeInitialState,
} from './directTypeBuffer';

type EditorProps = Parameters<ProvideEditorComponent<XPathCell>>[0];

export function CellFormulaEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const theme = usePrefsStore((state) => state.theme);
  const autocomplete = usePrefsStore((state) => state.autocompleteOnDollar);
  const fontSize = usePrefsStore((state) => state.formulaFontSize);
  const dark = useIsDark(theme);
  const cell = { sheet: 'survey' as const, rowId: value.data.rowId, column: value.data.column };
  const [startDoc, setStartDoc] = useDirectTypeInitialState(initialValue, value.data.value);
  const userEdited = useRef(false);

  const update = (next: string) => makeXPathCell({ ...value.data, value: next });
  const finish = (next: string, movement: readonly [-1 | 0 | 1, -1 | 0 | 1] = [0, 0]) => {
    onFinishedEditing(update(next), movement);
  };

  // Glide commits its own overlay `tempValue` on outside click; a typed "$"
  // arrives as `initialValue` without touching the cell, so seed the overlay
  // once or clicking outside would commit the old value.
  useConsumeDirectType((pending) => {
    const initialDoc = pending?.text ?? startDoc;
    if (!userEdited.current) {
      if (pending && pending.text !== startDoc) {
        setStartDoc(pending.text);
      }
      onChange(update(initialDoc));
    }
    if (!pending?.trailingAction) return;
    const movement = actionMovement(pending.trailingAction);
    if (!movement) onFinishedEditing(undefined);
    else finish(initialDoc, movement);
  });

  return (
    <div className="bg-background min-h-[72px] w-[min(560px,80vw)] overflow-hidden">
      <CodeMirrorEditor
        value={startDoc}
        xpath
        dark={dark}
        autocomplete={autocomplete}
        fontSize={fontSize}
        autoFocus
        commitOnTab
        commitOnBlur={false}
        ariaLabel="Formula cell editor"
        className="max-h-[220px] min-h-[72px] overflow-auto"
        testId="cell-formula-editor"
        onChange={(next) => {
          userEdited.current = true;
          onChange(update(next));
        }}
        onCommit={(next) => finish(next)}
        onCancel={() => onFinishedEditing(undefined)}
        onTabCommit={(next) => finish(next, [1, 0])}
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
    </div>
  );
}
