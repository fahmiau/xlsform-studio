/**
 * User-facing toasts for refactoring actions (Stage 5). Every message that
 * reports a rewrite offers Undo, which is the same history entry as the edit
 * (AD-2), so one click restores the name and every reference.
 */
import { toast } from 'sonner';

import type { CellEditOutcome } from '@/features/grid/cellEditPipeline';
import { useWorkbookStore } from '@/state/workbookStore';

function undoAction(): { label: string; onClick: () => void } {
  return {
    label: 'Undo',
    onClick: () => useWorkbookStore.temporal.getState().undo(),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Report the refactoring side effects of one committed edit batch. */
export function notifyCellEdits(outcome: CellEditOutcome): void {
  for (const rename of outcome.variableRenames) {
    if (rename.changes === 0) continue;
    toast.success(`Renamed ${rename.from} → ${rename.to}`, {
      description: `Updated ${plural(rename.changes, 'reference')} across formulas and text.`,
      action: undoAction(),
    });
  }

  if (outcome.skippedDuplicate) {
    const { name, uses } = outcome.skippedDuplicate;
    toast.warning(`Not propagating "${name}"`, {
      description: `It names ${uses} questions, so formulas are ambiguous. The name was changed but references were left alone.`,
    });
  }

  if (outcome.choiceRenames.length > 0) {
    const [first] = outcome.choiceRenames;
    if (!first) return;
    const subject =
      outcome.choiceRenames.length === 1
        ? `${first.from} → ${first.to}`
        : `${plural(outcome.choiceRenames.length, 'choice')}`;
    const description =
      outcome.choiceChanges > 0
        ? `Updated ${plural(outcome.choiceChanges, 'formula cell')}.`
        : 'No formulas referenced this choice.';
    toast.success(`Renamed ${subject}`, { description, action: undoAction() });
  }
}
