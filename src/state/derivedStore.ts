/**
 * Derived indexes (AD-3). Rebuilt synchronously whenever document data changes;
 * never part of undo history and never exported.
 */
import { create } from 'zustand';

import { buildAllIndexes, type AllIndexes } from '@/core/indexes';
import type { VariableOptions } from '@/core/indexes/variables';

import { useWorkbookStore } from './workbookStore';

export interface DerivedState {
  indexes: AllIndexes;
  options: VariableOptions;
  rebuild: () => void;
}

export const useDerivedStore = create<DerivedState>()((set) => ({
  indexes: buildAllIndexes(useWorkbookStore.getState().data),
  options: {},
  rebuild: () =>
    set((state) => ({
      indexes: buildAllIndexes(useWorkbookStore.getState().data, state.options),
    })),
}));

// Keep indexes in sync with every document mutation. Tests that replace the
// store wholesale still go through `apply`/`load`, so this subscription is the
// single recompute path.
useWorkbookStore.subscribe((state, previous) => {
  if (state.data === previous.data) return;
  useDerivedStore.setState({
    indexes: buildAllIndexes(state.data, useDerivedStore.getState().options),
  });
});
