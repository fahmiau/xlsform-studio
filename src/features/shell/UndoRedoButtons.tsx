/** Undo/redo toolbar buttons with action labels (Task 2.8). */
import { Redo2, Undo2 } from 'lucide-react';
import { useStore } from 'zustand';

import { Button } from '@/components/ui/button';
import { findColumnKey } from '@/core/indexes/columns';
import { parseType } from '@/core/model/parseType';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { getActionMeta, useWorkbookStore, type ActionMeta } from '@/state/workbookStore';

function revealMeta(meta: ActionMeta | undefined, direction: 'undo' | 'redo'): void {
  if (!meta?.sheet) return;
  const rowId =
    direction === 'undo' ? (meta.undoRowIds?.[0] ?? meta.rowIds?.[0]) : meta.rowIds?.[0];
  if (!rowId) return;

  const column = meta.columns?.[0];
  const ui = useUiStore.getState();
  const prefs = usePrefsStore.getState();
  const drawerVisible =
    Boolean(meta.inDrawer) &&
    ui.activeSheet === 'survey' &&
    prefs.rightPanel &&
    ui.rightTab === 'choices' &&
    ui.choiceDrawer.open;
  let switchSheet = !drawerVisible;
  if (drawerVisible && meta.sheet === 'choices') {
    const data = useWorkbookStore.getState().data;
    const listKey = findColumnKey(data.choices, 'list_name') ?? 'list_name';
    const choiceList = data.choices.rows.find((row) => row.id === rowId)?.cells[listKey]?.trim();
    const surveyRowId = ui.choiceDrawer.rowId ?? ui.activeCells.survey?.rowId ?? null;
    const surveyRow = surveyRowId
      ? data.survey.rows.find((row) => row.id === surveyRowId)
      : undefined;
    const typeKey = findColumnKey(data.survey, 'type') ?? 'type';
    const activeList = surveyRow ? parseType(surveyRow.cells[typeKey] ?? '').listName : undefined;
    if (!choiceList || choiceList !== activeList) {
      switchSheet = true;
    }
  }

  ui.requestReveal(meta.sheet, rowId, {
    ...(column ? { column } : {}),
    ...(switchSheet ? {} : { switchSheet: false }),
  });
}

export function undoWithReveal(): void {
  const before = useWorkbookStore.getState().data;
  useWorkbookStore.temporal.getState().undo();
  const after = useWorkbookStore.getState().data;
  if (after === before) return;
  revealMeta(getActionMeta(before), 'undo');
}

export function redoWithReveal(): void {
  const before = useWorkbookStore.getState().data;
  useWorkbookStore.temporal.getState().redo();
  const after = useWorkbookStore.getState().data;
  if (after === before) return;
  revealMeta(getActionMeta(after), 'redo');
}

export function UndoRedoButtons() {
  const canUndo = useStore(useWorkbookStore.temporal, (state) => state.pastStates.length > 0);
  const canRedo = useStore(useWorkbookStore.temporal, (state) => state.futureStates.length > 0);
  const label = useWorkbookStore((state) => getActionMeta(state.data)?.label);
  const redoLabel = useStore(useWorkbookStore.temporal, (state) => {
    const next = state.futureStates.at(-1)?.data;
    return next ? getActionMeta(next)?.label : undefined;
  });

  const undo = () => {
    undoWithReveal();
  };
  const redo = () => {
    redoWithReveal();
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        data-testid="undo-button"
        disabled={!canUndo}
        title={label ? `Undo: ${label}` : 'Undo'}
        onClick={undo}
      >
        <Undo2 aria-hidden />
        <span className="sr-only">Undo</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="redo-button"
        disabled={!canRedo}
        title={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
        onClick={redo}
      >
        <Redo2 aria-hidden />
        <span className="sr-only">Redo</span>
      </Button>
    </div>
  );
}
