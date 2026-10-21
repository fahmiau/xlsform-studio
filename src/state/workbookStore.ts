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
import type { WorkbookData } from '@/core/model/types';

export type DataUpdate = (data: WorkbookData) => WorkbookData;

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
  apply: (label: string, update: DataUpdate) => void;
  load: (data: WorkbookData, options?: LoadOptions) => void;
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

      apply: (label, update) =>
        set((state) => {
          const next = update(state.data);
          if (next === state.data) return {};
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
