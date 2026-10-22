/**
 * UI-only state (AD-3): active sheet/cell, selection, fold state, panels, and
 * language view mode. Fold state lives here so collapsing a group neither
 * creates undo entries nor marks the file dirty.
 */
import { create } from 'zustand';
import type { GridSelection } from '@glideapps/glide-data-grid';

import type { ColumnKey, RowId } from '@/core/model/types';

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

export interface RevealRequest {
  sheet: SheetTab;
  rowId: RowId;
  /** Bumped so repeated reveals of the same row still fire. */
  nonce: number;
}

export interface UiState {
  activeSheet: SheetTab;
  /** Active cell on the current sheet (the formula bar reads this). */
  activeCell: CellRef | null;
  /** Active cell remembered per sheet (Task 2.7). */
  activeCells: Partial<Record<SheetTab, CellRef>>;
  selection: Selection | null;
  /** Glide selection per sheet (cell range + row markers). */
  gridSelections: Partial<Record<SheetTab, GridSelection>>;
  /** Non-contiguous row selection in the grid, as real row ids. */
  selectedRowIds: RowId[];
  collapsedGroupIds: Set<RowId>;
  panels: { outline: boolean; lint: boolean; ai: boolean };
  languageView: { mode: LanguageViewMode; language: string | null };
  /** Session-only per-sheet column widths (Task 2.2). */
  columnWidths: Partial<Record<SheetTab, Record<ColumnKey, number>>>;
  /** View-only hidden columns (Task 2.6). */
  hiddenColumns: Partial<Record<SheetTab, Set<ColumnKey>>>;
  reveal: RevealRequest | null;
  setActiveSheet: (sheet: SheetTab) => void;
  setActiveCell: (cell: CellRef | null) => void;
  setSelection: (selection: Selection | null) => void;
  setGridSelection: (sheet: SheetTab, selection: GridSelection) => void;
  setSelectedRowIds: (rowIds: RowId[]) => void;
  toggleGroupCollapsed: (groupId: RowId) => void;
  setPanel: (panel: keyof UiState['panels'], visible: boolean) => void;
  setLanguageView: (mode: LanguageViewMode, language?: string | null) => void;
  setColumnWidth: (sheet: SheetTab, column: ColumnKey, width: number) => void;
  toggleColumnHidden: (sheet: SheetTab, column: ColumnKey) => void;
  showAllColumns: (sheet: SheetTab) => void;
  requestReveal: (sheet: SheetTab, rowId: RowId) => void;
}

let revealNonce = 0;

export const useUiStore = create<UiState>()((set) => ({
  activeSheet: 'survey',
  activeCell: null,
  activeCells: {},
  selection: null,
  gridSelections: {},
  selectedRowIds: [],
  collapsedGroupIds: new Set(),
  panels: { outline: true, lint: false, ai: false },
  languageView: { mode: 'all', language: null },
  columnWidths: {},
  hiddenColumns: {},
  reveal: null,

  setActiveSheet: (activeSheet) =>
    set((state) => ({
      activeSheet,
      activeCell: state.activeCells[activeSheet] ?? null,
      reveal: null,
    })),
  setActiveCell: (activeCell) =>
    set((state) => {
      if (!activeCell) return { activeCell: null };
      return {
        activeCell,
        activeCells: { ...state.activeCells, [activeCell.sheet]: activeCell },
      };
    }),
  setSelection: (selection) => set({ selection }),
  setGridSelection: (sheet, gridSelection) =>
    set((state) => ({
      gridSelections: { ...state.gridSelections, [sheet]: gridSelection },
    })),
  setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
  toggleGroupCollapsed: (groupId) =>
    set((state) => {
      const collapsedGroupIds = new Set(state.collapsedGroupIds);
      if (collapsedGroupIds.has(groupId)) collapsedGroupIds.delete(groupId);
      else collapsedGroupIds.add(groupId);
      return { collapsedGroupIds };
    }),
  setPanel: (panel, visible) => set((state) => ({ panels: { ...state.panels, [panel]: visible } })),
  setLanguageView: (mode, language = null) => set({ languageView: { mode, language } }),

  setColumnWidth: (sheet, column, width) =>
    set((state) => ({
      columnWidths: {
        ...state.columnWidths,
        [sheet]: { ...state.columnWidths[sheet], [column]: width },
      },
    })),
  toggleColumnHidden: (sheet, column) =>
    set((state) => {
      const hidden = new Set(state.hiddenColumns[sheet] ?? []);
      if (hidden.has(column)) hidden.delete(column);
      else hidden.add(column);
      return { hiddenColumns: { ...state.hiddenColumns, [sheet]: hidden } };
    }),
  showAllColumns: (sheet) =>
    set((state) => ({ hiddenColumns: { ...state.hiddenColumns, [sheet]: new Set() } })),
  requestReveal: (sheet, rowId) =>
    set((state) => ({
      activeSheet: sheet,
      activeCell: state.activeCells[sheet] ?? null,
      reveal: { sheet, rowId, nonce: (revealNonce += 1) },
    })),
}));
