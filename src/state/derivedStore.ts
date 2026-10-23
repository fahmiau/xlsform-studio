/**
 * Derived indexes and diagnostics (AD-3). Rebuilt synchronously whenever
 * document data changes; never part of undo history and never exported.
 *
 * The linter is debounced by 150 ms (Task 4.7), except on open/new where it
 * runs immediately so the first paint already has a status badge.
 */
import { create } from 'zustand';

import { buildAllIndexes, type AllIndexes } from '@/core/indexes';
import type { VariableOptions } from '@/core/indexes/variables';
import { discoverLanguages, type Language } from '@/core/languages/discover';
import { runLint, type DiagnosticIssue } from '@/core/lint';
import { buildDiagnosticsIndex, type DiagnosticsIndex } from '@/core/lint/diagnostics';
import { readSettings } from '@/core/model/settings';
import type { WorkbookData } from '@/core/model/types';

import { useWorkbookStore } from './workbookStore';

export const LINT_DEBOUNCE_MS = 150;

export interface DerivedState {
  indexes: AllIndexes;
  options: VariableOptions;
  /** Discovered languages for the toolbar and grid view modes (Task 5.3). */
  languages: Language[];
  diagnostics: DiagnosticIssue[];
  diagnosticIndex: DiagnosticsIndex;
  rebuild: () => void;
  /** Run the linter synchronously with the current data and indexes. */
  runLintNow: () => void;
}

function optionsFor(data: WorkbookData): VariableOptions {
  const { defaultLanguage } = readSettings(data.settings);
  return defaultLanguage ? { defaultLanguage } : {};
}

function computeIndexes(data: WorkbookData, options: VariableOptions): AllIndexes {
  return buildAllIndexes(data, options);
}

const initialData = useWorkbookStore.getState().data;
const initialOptions = optionsFor(initialData);
const initialIndexes = computeIndexes(initialData, initialOptions);
const initialDiagnostics = runLint(initialData, initialIndexes);

let lintTimer: ReturnType<typeof setTimeout> | null = null;

export const useDerivedStore = create<DerivedState>()((set, get) => ({
  indexes: initialIndexes,
  options: initialOptions,
  languages: discoverLanguages(initialData),
  diagnostics: initialDiagnostics,
  diagnosticIndex: buildDiagnosticsIndex(initialDiagnostics),
  rebuild: () => {
    const data = useWorkbookStore.getState().data;
    const options = optionsFor(data);
    const indexes = computeIndexes(data, options);
    const diagnostics = runLint(data, indexes);
    set({
      indexes,
      options,
      languages: discoverLanguages(data),
      diagnostics,
      diagnosticIndex: buildDiagnosticsIndex(diagnostics),
    });
  },
  runLintNow: () => {
    if (lintTimer !== null) {
      clearTimeout(lintTimer);
      lintTimer = null;
    }
    const data = useWorkbookStore.getState().data;
    const diagnostics = runLint(data, get().indexes);
    set({ diagnostics, diagnosticIndex: buildDiagnosticsIndex(diagnostics) });
  },
}));

function scheduleLint(): void {
  if (lintTimer !== null) clearTimeout(lintTimer);
  lintTimer = setTimeout(() => {
    lintTimer = null;
    useDerivedStore.getState().runLintNow();
  }, LINT_DEBOUNCE_MS);
}

// Keep indexes in sync with every document mutation. Tests that replace the
// store wholesale still go through `apply`/`load`, so this subscription is the
// single recompute path.
useWorkbookStore.subscribe((state, previous) => {
  if (state.data === previous.data) return;
  const options = optionsFor(state.data);
  useDerivedStore.setState({
    indexes: computeIndexes(state.data, options),
    options,
    languages: discoverLanguages(state.data),
  });
  // `lastAction === null` means load/restore/new, where linting immediately is
  // cheap enough and avoids an empty badge on first paint.
  if (state.lastAction === null) useDerivedStore.getState().runLintNow();
  else scheduleLint();
});
