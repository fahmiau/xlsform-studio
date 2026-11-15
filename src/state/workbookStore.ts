/**
 * Document store (master plan AD-3): `WorkbookData` only, tracked by zundo.
 *
 * `apply(label, update)` is the single mutation entry point (AD-2). Each call is
 * one `set`, therefore one undo entry, even when it performs several ops:
 *
 * ```ts
 * apply('insert 3 rows', (data) =>
 *   setCells(insertRows(data, 'survey', 0, rows), 'survey', edits),
 * );
 * ```
 */
import type ExcelJS from 'exceljs';
import { create } from 'zustand';
import { temporal } from 'zundo';

import { createEmptyWorkbook } from '@/core/model/factory';
import type { ColumnKey, ManagedSheetName, RowId, WorkbookData } from '@/core/model/types';

export type DataUpdate = (data: WorkbookData) => WorkbookData;

export interface ActionMeta {
  label: string;
  /** Sheet the action edited, for scroll-to-change after undo/redo. */
  sheet?: ManagedSheetName;
  /** Rows the action touched, in the result (and redo reveal target). */
  rowIds?: RowId[];
  /** Rows to reveal when undoing this action (e.g. deleted rows restored by undo). */
  undoRowIds?: RowId[];
  /** Columns the action touched, so undo/redo highlights the exact cell. */
  columns?: ColumnKey[];
  /** True when the action originated inside the Choices Drawer. */
  inDrawer?: boolean;
}

/**
 * History entries only store `data` (zundo partialize). Action metadata is
 * keyed by the resulting data reference, so undo/redo can reveal the change
 * without storing extra state inside the undo entry.
 */
const actionMeta = new WeakMap<WorkbookData, ActionMeta>();

export function getActionMeta(data: WorkbookData): ActionMeta | undefined {
  return actionMeta.get(data);
}

export interface LoadOptions {
  filePath?: string | null;
  sourceHandle?: ExcelJS.Workbook | null;
  warnings?: string[];
}

export interface WorkbookState {
  data: WorkbookData;
  /** Last saved/loaded data reference; `data !== savedData` means dirty. */
  savedData: WorkbookData;
  filePath: string | null;
  /** ExcelJS workbook for style-preserving saves; never part of history. */
  sourceHandle: ExcelJS.Workbook | null;
  warnings: string[];
  lastAction: string | null;
  apply: (label: string, update: DataUpdate, meta?: Omit<ActionMeta, 'label'>) => void;
  load: (data: WorkbookData, options?: LoadOptions) => void;
  /** Restore a crash-recovery snapshot. Always marks the document dirty. */
  restore: (data: WorkbookData, options?: LoadOptions) => void;
  newWorkbook: () => void;
  markSaved: (filePath?: string | null) => void;
}

const initialData = createEmptyWorkbook();

export const useWorkbookStore = create<WorkbookState>()(
  temporal(
    (set) => ({
      data: initialData,
      savedData: initialData,
      filePath: null,
      sourceHandle: null,
      warnings: [],
      lastAction: null,

      apply: (label, update, meta) =>
        set((state) => {
          const next = update(state.data);
          if (next === state.data) return {};
          actionMeta.set(next, { label, ...meta });
          return { data: next, lastAction: label };
        }),

      load: (data, options = {}) => {
        set({
          data,
          savedData: data,
          filePath: options.filePath ?? null,
          sourceHandle: options.sourceHandle ?? null,
          warnings: options.warnings ?? [],
          lastAction: null,
        });
        useWorkbookStore.temporal.getState().clear();
      },

      restore: (data, options = {}) => {
        set({
          data,
          // A recovered snapshot has no known saved reference: keep the
          // document dirty until the user saves.
          savedData: createEmptyWorkbook(),
          filePath: options.filePath ?? null,
          sourceHandle: options.sourceHandle ?? null,
          warnings: options.warnings ?? [],
          lastAction: null,
        });
        useWorkbookStore.temporal.getState().clear();
      },

      newWorkbook: () => {
        const data = createEmptyWorkbook();
        set({
          data,
          savedData: data,
          filePath: null,
          sourceHandle: null,
          warnings: [],
          lastAction: null,
        });
        useWorkbookStore.temporal.getState().clear();
      },

      markSaved: (filePath) =>
        set((state) => ({
          savedData: state.data,
          filePath: filePath === undefined ? state.filePath : filePath,
        })),
    }),
    {
      limit: 100,
      partialize: (state) => ({ data: state.data }),
      equality: (past, current) => past.data === current.data,
    },
  ),
);

/** Reactive dirty flag; undoing back to the saved reference clears it. */
export function selectIsDirty(state: WorkbookState): boolean {
  return state.data !== state.savedData;
}

/** Convenience hook for components. */
export function useIsDirty(): boolean {
  return useWorkbookStore(selectIsDirty);
}
