/** In-cell CodeMirror formula editor (Task 4.6). */
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { diagnosticCellKey } from '@/core/lint/diagnostics';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useIsDark } from '@/lib/theme';
import { useWorkbookStore } from '@/state/workbookStore';

import { CodeMirrorEditor } from '../../formula/CodeMirrorEditor';
import { completionDataFor } from '../../formula/completions';
import { makeXPathCell, type XPathCell } from '../cells/XPathCell';

type EditorProps = Parameters<ProvideEditorComponent<XPathCell>>[0];

export function CellFormulaEditor({ value, onFinishedEditing }: EditorProps) {
  const theme = usePrefsStore((state) => state.theme);
  const autocomplete = usePrefsStore((state) => state.autocompleteOnDollar);
  const fontSize = usePrefsStore((state) => state.formulaFontSize);
  const dark = useIsDark(theme);
  const cell = { sheet: 'survey' as const, rowId: value.data.rowId, column: value.data.column };

  const finish = (next: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    const updated = makeXPathCell({ ...value.data, value: next });
    onFinishedEditing(updated, movement);
  };

  return (
    <div className="bg-background min-h-[72px] w-[min(560px,80vw)] overflow-hidden">
      <CodeMirrorEditor
        value={value.data.value}
        xpath
        dark={dark}
        autocomplete={autocomplete}
        fontSize={fontSize}
        autoFocus
        commitOnTab
        ariaLabel="Formula cell editor"
        className="max-h-[220px] min-h-[72px] overflow-auto"
        testId="cell-formula-editor"
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
