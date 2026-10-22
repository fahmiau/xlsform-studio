/**
 * UI-only state (AD-3): active sheet/cell, selection, fold state, panels, and
 * language view mode. Fold state lives here so collapsing a group neither
 * creates undo entries nor marks the file dirty.
 */
import { create } from 'zustand';
import type { GridSelection } from '@glideapps/glide-data-grid';

import type { ColumnKey, RowId } from '@/core/model/types';
import type { ListMode } from '@/core/slug/slugify';

export type SheetTab = 'survey' | 'choices' | 'settings';
export type RightTab = 'choices' | 'ai';
export type LeftTab = 'outline' | 'lint';

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

/** Live edit preview while the formula bar has focus (UI-only, no undo). */
export interface CellPreview {
  sheet: SheetTab;
  rowId: RowId;
  column: string;
  value: string;
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
  /** Row flashed by outline/reveal navigation (Task 3.9). */
  flashRowId: RowId | null;
  /** Choices Drawer binding + session list naming mode (Tasks 3.4/3.5). */
  choiceDrawer: { open: boolean; rowId: RowId | null };
  choiceModes: Record<string, ListMode>;
  dismissedSharedLists: Set<string>;
  rightTab: RightTab;
  leftTab: LeftTab;
  panels: { outline: boolean; lint: boolean; ai: boolean };
  languageView: { mode: LanguageViewMode; language: string | null };
  /** Session-only per-sheet column widths (Task 2.2). */
  columnWidths: Partial<Record<SheetTab, Record<ColumnKey, number>>>;
  /** View-only hidden columns (Task 2.6). */
  hiddenColumns: Partial<Record<SheetTab, Set<ColumnKey>>>;
  reveal: RevealRequest | null;
  cellPreview: CellPreview | null;
  setActiveSheet: (sheet: SheetTab) => void;
  setActiveCell: (cell: CellRef | null) => void;
  setSelection: (selection: Selection | null) => void;
  setGridSelection: (sheet: SheetTab, selection: GridSelection) => void;
  setSelectedRowIds: (rowIds: RowId[]) => void;
  toggleGroupCollapsed: (groupId: RowId) => void;
  expandGroups: (groupIds: readonly RowId[]) => void;
  flashRow: (rowId: RowId | null) => void;
  openChoicesDrawer: (rowId?: RowId | null) => void;
  closeChoicesDrawer: () => void;
  setDrawerRow: (rowId: RowId) => void;
  setChoiceMode: (listName: string, mode: ListMode) => void;
  dismissSharedList: (listName: string) => void;
  setRightTab: (tab: RightTab) => void;
  setLeftTab: (tab: LeftTab) => void;
  setPanel: (panel: keyof UiState['panels'], visible: boolean) => void;
  setLanguageView: (mode: LanguageViewMode, language?: string | null) => void;
  setColumnWidth: (sheet: SheetTab, column: ColumnKey, width: number) => void;
  toggleColumnHidden: (sheet: SheetTab, column: ColumnKey) => void;
  showAllColumns: (sheet: SheetTab) => void;
  requestReveal: (sheet: SheetTab, rowId: RowId) => void;
  setCellPreview: (preview: CellPreview | null) => void;
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
  flashRowId: null,
  choiceDrawer: { open: false, rowId: null },
  choiceModes: {},
  dismissedSharedLists: new Set(),
  rightTab: 'choices',
  leftTab: 'outline',
  panels: { outline: true, lint: false, ai: false },
  languageView: { mode: 'all', language: null },
  columnWidths: {},
  hiddenColumns: {},
  reveal: null,
  cellPreview: null,

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
  expandGroups: (groupIds) =>
    set((state) => {
      if (groupIds.length === 0) return {};
      const collapsedGroupIds = new Set(state.collapsedGroupIds);
      let changed = false;
      for (const groupId of groupIds) {
        if (collapsedGroupIds.delete(groupId)) changed = true;
      }
      return changed ? { collapsedGroupIds } : {};
    }),
  flashRow: (flashRowId) => set({ flashRowId }),
  openChoicesDrawer: (rowId = null) =>
    set((state) => ({
      rightTab: 'choices',
      choiceDrawer: { open: true, rowId: rowId ?? state.choiceDrawer.rowId },
    })),
  closeChoicesDrawer: () =>
    set((state) => ({ choiceDrawer: { ...state.choiceDrawer, open: false } })),
  setDrawerRow: (rowId) =>
    set((state) =>
      state.choiceDrawer.open ? { choiceDrawer: { ...state.choiceDrawer, rowId } } : {},
    ),
  setChoiceMode: (listName, mode) =>
    set((state) => ({ choiceModes: { ...state.choiceModes, [listName]: mode } })),
  dismissSharedList: (listName) =>
    set((state) => ({ dismissedSharedLists: new Set(state.dismissedSharedLists).add(listName) })),
  setRightTab: (rightTab) => set({ rightTab }),
  setLeftTab: (leftTab) => set({ leftTab }),
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
  setCellPreview: (cellPreview) => set({ cellPreview }),
}));
