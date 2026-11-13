/**
 * Build Mode staging (AD-11).
 *
 * `base` is the document when the run starts, `draft` is mutated by tool calls.
 * The live workbook store is untouched until Accept, which applies the draft in
 * one `apply` call (one undo entry). Revert only drops the draft.
 */
import { create } from 'zustand';

import { applyToolCall, type ToolResult } from '@/core/ai/applyTools';
import { diffWorkbooks, type WorkbookDiff } from '@/core/ai/diff';
import { lintDelta, type LintDelta } from '@/core/ai/lintDelta';
import type { ToolName } from '@/core/ai/tools';
import type { WorkbookData } from '@/core/model/types';

import { useWorkbookStore } from './workbookStore';

export interface StagingState {
  base: WorkbookData | null;
  draft: WorkbookData | null;
  diff: WorkbookDiff | null;
  lint: LintDelta | null;
  /** A model/tool loop is in flight. */
  running: boolean;
  start: () => void;
  applyTool: (name: ToolName, input: unknown) => ToolResult;
  setDraft: (draft: WorkbookData) => void;
  setRunning: (running: boolean) => void;
  accept: () => void;
  revert: () => void;
}

function emptyDiff(base: WorkbookData): WorkbookDiff {
  return diffWorkbooks(base, base);
}

export const useStagingStore = create<StagingState>()((set, get) => ({
  base: null,
  draft: null,
  diff: null,
  lint: null,
  running: false,

  start: () => {
    const base = useWorkbookStore.getState().data;
    set({
      base,
      draft: base,
      diff: emptyDiff(base),
      lint: { added: [], removed: [] },
      running: true,
    });
  },

  applyTool: (name, input) => {
    const { draft, base } = get();
    if (!draft || !base) {
      return { ok: false, summary: 'no Build Mode draft is active', errors: ['no active draft'] };
    }
    const outcome = applyToolCall(draft, name, input);
    if (outcome.data === draft) return outcome.result;
    const next = outcome.data;
    set({
      draft: next,
      diff: diffWorkbooks(base, next),
      lint: lintDelta(base, next),
    });
    return outcome.result;
  },

  setDraft: (draft) => {
    const { base } = get();
    if (!base) return;
    set({ draft, diff: diffWorkbooks(base, draft), lint: lintDelta(base, draft) });
  },

  setRunning: (running) => set({ running }),

  accept: () => {
    const { base, draft, diff } = get();
    if (!base || !draft) return;
    if (draft !== base) {
      const label = diff?.summary.text ? `AI: ${diff.summary.text}` : 'AI changes';
      useWorkbookStore.getState().apply(label, () => draft);
    }
    set({ base: null, draft: null, diff: null, lint: null, running: false });
  },

  revert: () => {
    set({ base: null, draft: null, diff: null, lint: null, running: false });
  },
}));

/** True while a staged draft is waiting for Accept/Revert. */
export function selectIsStaged(state: StagingState): boolean {
  return state.draft !== null;
}

/** A draft with real changes has finished running and needs review. */
export function selectReviewPending(state: StagingState): boolean {
  return (
    state.draft !== null && !state.running && state.diff !== null && state.diff.summary.total > 0
  );
}
