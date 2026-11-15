/** Shared jump-to-diagnostic behavior for the panel and F8 navigation. */
import type { DiagnosticIssue } from '@/core/lint';
import { useUiStore } from '@/state/uiStore';

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export function revealDiagnostic(issue: DiagnosticIssue): void {
  const ui = useUiStore.getState();
  ui.setActiveSheet(issue.sheet);
  if (issue.column) {
    ui.setActiveCell({ sheet: issue.sheet, rowId: issue.rowId, column: issue.column });
  }
  ui.requestReveal(issue.sheet, issue.rowId, issue.column ? { column: issue.column } : undefined);
  ui.flashRow(issue.rowId);
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    if (useUiStore.getState().flashRowId === issue.rowId) useUiStore.getState().flashRow(null);
  }, 600);
}
