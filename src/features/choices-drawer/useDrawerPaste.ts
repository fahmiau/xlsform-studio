/** Bulk paste pipeline for the drawer (Task 3.5): N rows, one undo step. */
import { useCallback } from 'react';
import { toast } from 'sonner';

import type { ColumnKey } from '@/core/model/types';
import { bulkInsertChoices } from '@/core/ops/choices';
import type { ListMode } from '@/core/slug/slugify';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export function useDrawerPaste(
  listName: string | null,
  keys: readonly ColumnKey[],
  mode: ListMode,
): (matrix: readonly (readonly string[])[]) => boolean {
  return useCallback(
    (matrix) => {
      if (!listName || matrix.length === 0) return false;
      let rowIds: string[] = [];
      useWorkbookStore.getState().apply(
        `Paste ${matrix.length} choice${matrix.length === 1 ? '' : 's'}`,
        (data) => {
          const result = bulkInsertChoices(data, listName, matrix, keys, { mode });
          rowIds = result.rowIds;
          return result.data;
        },
        { sheet: 'choices' },
      );
      if (rowIds.length > 0) {
        useUiStore.getState().setSelectedRowIds(rowIds);
        toast.success(`Added ${rowIds.length} choice${rowIds.length === 1 ? '' : 's'}`);
      }
      return true;
    },
    [keys, listName, mode],
  );
}
