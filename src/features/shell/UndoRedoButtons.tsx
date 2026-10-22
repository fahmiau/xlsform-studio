/** Undo/redo toolbar buttons with action labels (Task 2.8). */
import { Redo2, Undo2 } from 'lucide-react';
import { useStore } from 'zustand';

import { Button } from '@/components/ui/button';
import { useUiStore } from '@/state/uiStore';
import { getActionMeta, useWorkbookStore } from '@/state/workbookStore';

function revealAction(): void {
  const data = useWorkbookStore.getState().data;
  const meta = getActionMeta(data);
  if (!meta?.sheet) return;
  const rowId = meta.rowIds?.[0];
  if (rowId) useUiStore.getState().requestReveal(meta.sheet, rowId);
}

export function undoWithReveal(): void {
  useWorkbookStore.temporal.getState().undo();
  revealAction();
}

export function redoWithReveal(): void {
  useWorkbookStore.temporal.getState().redo();
  revealAction();
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
