/** F8 / Shift+F8 navigation through the sorted diagnostics list. */
import type { DiagnosticIssue } from '@/core/lint';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { revealDiagnostic } from './reveal';

const SHEET_RANK = { survey: 0, choices: 1, settings: 2 } as const;

type Position = [sheet: number, row: number, column: number];

function positionOf(issue: DiagnosticIssue): Position | null {
  const row = useDerivedStore.getState().indexes.rowIndexes[issue.sheet].get(issue.rowId);
  if (row === undefined) return null;
  const columns = useWorkbookStore.getState().data[issue.sheet].columns;
  const column = issue.column ? columns.indexOf(issue.column) : -1;
  return [SHEET_RANK[issue.sheet], row, column];
}

function activePosition(): Position | null {
  const active = useUiStore.getState().activeCell;
  if (!active) return null;
  const row = useDerivedStore.getState().indexes.rowIndexes[active.sheet].get(active.rowId);
  if (row === undefined) return null;
  const columns = useWorkbookStore.getState().data[active.sheet].columns;
  return [SHEET_RANK[active.sheet], row, columns.indexOf(active.column)];
}

function compare(left: Position, right: Position): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function nextProblem(direction: 1 | -1): void {
  const diagnostics = useDerivedStore.getState().diagnostics;
  if (diagnostics.length === 0) return;

  const current = activePosition();
  let target: DiagnosticIssue | undefined;
  if (!current) {
    target = direction === 1 ? diagnostics[0] : diagnostics[diagnostics.length - 1];
  } else if (direction === 1) {
    target = diagnostics.find((issue) => {
      const position = positionOf(issue);
      return position !== null && compare(position, current) > 0;
    });
    target ??= diagnostics[0];
  } else {
    for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
      const issue = diagnostics[index];
      if (!issue) continue;
      const position = positionOf(issue);
      if (position !== null && compare(position, current) < 0) {
        target = issue;
        break;
      }
    }
    target ??= diagnostics[diagnostics.length - 1];
  }

  if (target) revealDiagnostic(target);
}
