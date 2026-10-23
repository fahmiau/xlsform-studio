/**
 * Shared commit pipeline for cell edits (Tasks 5.1/5.2). Formula bar, grid, and
 * choices drawer all route through this one function so a committed edit and
 * its rename refactoring always land in a single `workbookStore.apply`
 * (AD-2) and therefore in one undo step.
 *
 * Pure: takes the workbook, returns the next workbook plus what changed. The
 * callers own the store write and the toasts.
 */
import type { CellEdit } from '@/core/ops/cells';
import { setCells } from '@/core/ops/cells';
import { applyChoiceEdits, applyTypeChange, renumberList } from '@/core/ops/choices';
import type { RenameResult } from '@/core/refactor/renameVariable';
import { countVariableUses, renameVariable } from '@/core/refactor/renameVariable';
import {
  changedChoiceNames,
  propagateChoiceRenames,
  type ChoiceNameChange,
} from '@/core/refactor/renameChoiceValue';
import { columnKey } from '@/core/indexes/columns';
import type { ListMode } from '@/core/slug/slugify';
import type { ManagedSheetName, WorkbookData } from '@/core/model/types';

export interface CellEditContext {
  /** Naming mode for the bound list (drawer only). */
  mode?: ListMode;
  /** Per-list session overrides from `uiStore.choiceModes`. */
  choiceModes?: Readonly<Record<string, ListMode>>;
  /** Preferences default for lists without names yet. */
  defaultMode?: ListMode;
  /** Slug length cap from Preferences. */
  maxLength?: number;
  /** `{name}` pattern for auto-bound list names (Task 3.3). */
  listNamePattern?: string;
}

export interface CellEditOutcome {
  data: WorkbookData;
  /** Name edits whose `${…}` references were rewritten. */
  variableRenames: Array<{ from: string; to: string; changes: number }>;
  /** A name edit skipped because the old name was ambiguous (duplicates). */
  skippedDuplicate?: { name: string; uses: number };
  /** Choice codes that changed and were propagated. */
  choiceRenames: ChoiceNameChange[];
  /** Survey cells rewritten by the choice-value propagation. */
  choiceChanges: number;
}

function emptyOutcome(data: WorkbookData): CellEditOutcome {
  return { data, variableRenames: [], choiceRenames: [], choiceChanges: 0 };
}

function nameEdits(data: WorkbookData, edits: readonly CellEdit[]): CellEdit[] {
  const nameKey = columnKey(data.survey, 'name');
  return edits.filter((edit) => edit.column === nameKey && (edit.value ?? '').trim().length > 0);
}

function applySurveyEdits(
  data: WorkbookData,
  edits: readonly CellEdit[],
  context: CellEditContext,
): CellEditOutcome {
  const outcome = emptyOutcome(data);
  let next = data;

  for (const edit of nameEdits(data, edits)) {
    const row = next.survey.rows.find((candidate) => candidate.id === edit.rowId);
    const from = (row?.cells[edit.column] ?? '').trim();
    const to = edit.value.trim();
    if (!from || from === to) continue;
    const uses = countVariableUses(next, from);
    if (uses > 1) {
      outcome.skippedDuplicate = { name: from, uses };
      continue;
    }
    const renamed: RenameResult = renameVariable(next, from, to);
    next = renamed.data;
    outcome.variableRenames.push({ from, to, changes: renamed.changes.length });
  }

  next = setCells(next, 'survey', edits);
  for (const edit of edits) {
    if (columnKey(next.survey, 'type') === edit.column) {
      next = applyTypeChange(
        next,
        edit.rowId,
        edit.value,
        context.listNamePattern === undefined ? {} : { pattern: context.listNamePattern },
      );
    }
  }
  outcome.data = next;
  return outcome;
}

function applyChoicesEdits(
  data: WorkbookData,
  edits: readonly CellEdit[],
  context: CellEditContext,
): CellEditOutcome {
  const next = applyChoiceEdits(data, edits, {
    ...(context.mode ? { mode: context.mode } : {}),
    ...(context.choiceModes ? { listModes: context.choiceModes } : {}),
    ...(context.defaultMode ? { fallbackMode: context.defaultMode } : {}),
    ...(context.maxLength !== undefined ? { maxLength: context.maxLength } : {}),
  });
  const propagated = propagateChoiceRenames(data, next);
  return {
    data: propagated.data,
    variableRenames: [],
    choiceRenames: changedChoiceNames(data, next),
    choiceChanges: propagated.changes.length,
  };
}

/** One committed edit batch for any sheet; feed the result to `apply`. */
export function applyCellEdits(
  data: WorkbookData,
  sheet: ManagedSheetName,
  edits: readonly CellEdit[],
  context: CellEditContext = {},
): CellEditOutcome {
  if (edits.length === 0) return emptyOutcome(data);
  if (sheet === 'survey') return applySurveyEdits(data, edits, context);
  if (sheet === 'choices') return applyChoicesEdits(data, edits, context);
  return { ...emptyOutcome(setCells(data, sheet, edits)) };
}

/**
 * Regenerate a list's names for a naming mode and propagate every code that
 * changed through the choice-value refactor (Task 5.2, same transaction).
 */
export function applyListMode(
  data: WorkbookData,
  listName: string,
  mode: ListMode,
  maxLength?: number,
): CellEditOutcome {
  const next = renumberList(data, listName, mode, maxLength);
  if (next === data) return emptyOutcome(data);
  const propagated = propagateChoiceRenames(data, next);
  return {
    data: propagated.data,
    variableRenames: [],
    choiceRenames: changedChoiceNames(data, next),
    choiceChanges: propagated.changes.length,
  };
}
