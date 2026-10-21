/**
 * UI-only state (AD-3): active sheet/cell, selection, fold state, panels, and
 * language view mode. Fold state lives here so collapsing a group neither
 * creates undo entries nor marks the file dirty.
 */
import { create } from 'zustand';

import type { RowId } from '@/core/model/types';

export type SheetTab = 'survey' | 'choices' | 'settings';

export interface CellRef {
  sheet: SheetTab;
  rowId: RowId;
  column: string;
}

export interface Selection {
  sheet: SheetTab;
  anchor: CellRef;
  focus: CellRef;
}

export type LanguageViewMode = 'all' | 'single' | 'split';

export interface UiState {
  activeSheet: SheetTab;
  activeCell: CellRef | null;
  selection: Selection | null;
  collapsedGroupIds: Set<RowId>;
  panels: { outline: boolean; lint: boolean; ai: boolean };
  languageView: { mode: LanguageViewMode; language: string | null };
  setActiveSheet: (sheet: SheetTab) => void;
  setActiveCell: (cell: CellRef | null) => void;
  setSelection: (selection: Selection | null) => void;
  toggleGroupCollapsed: (groupId: RowId) => void;
  setPanel: (panel: keyof UiState['panels'], visible: boolean) => void;
  setLanguageView: (mode: LanguageViewMode, language?: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeSheet: 'survey',
  activeCell: null,
  selection: null,
  collapsedGroupIds: new Set(),
  panels: { outline: true, lint: false, ai: false },
  languageView: { mode: 'all', language: null },

  setActiveSheet: (activeSheet) => set({ activeSheet }),
  setActiveCell: (activeCell) => set({ activeCell }),
  setSelection: (selection) => set({ selection }),
  toggleGroupCollapsed: (groupId) =>
    set((state) => {
      const collapsedGroupIds = new Set(state.collapsedGroupIds);
      if (collapsedGroupIds.has(groupId)) collapsedGroupIds.delete(groupId);
      else collapsedGroupIds.add(groupId);
      return { collapsedGroupIds };
    }),
  setPanel: (panel, visible) => set((state) => ({ panels: { ...state.panels, [panel]: visible } })),
  setLanguageView: (mode, language = null) => set({ languageView: { mode, language } }),
}));
