/**
 * Clipboard actions for the context menu and shortcut fallback (Task 2.5).
 * Glide's built-in copy/paste stays the primary keyboard path because it writes
 * synchronously to the WebView clipboard; these helpers cover the menu and
 * reuse the same pure TSV module.
 */
import { useCallback } from 'react';
import type { GridSelection } from '@glideapps/glide-data-grid';
import { toast } from 'sonner';

import { findColumnKey } from '@/core/indexes/columns';
import type { ColumnKey, ManagedSheetName, RowId } from '@/core/model/types';
import { setCells } from '@/core/ops/cells';
import { useWorkbookStore } from '@/state/workbookStore';

import { matrixFromSheet, parseTsv, pasteMatrix, serializeTsv, toHtmlTable } from './clipboard';
import { isCellEditable } from './editability';
import { realRowIndex, type RowProjection } from './projection';
import { selectionBounds, selectionColumnKeys, selectionRowIndexes } from './selection';

export interface ClipboardTarget {
  rowIndex: number;
  columnIndex: number;
}

async function writeClipboard(text: string, html: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the error toast.
  }
  toast.error('Could not write to the clipboard', {
    description: 'Use Ctrl+C / Ctrl+V instead.',
  });
  return false;
}

export function useClipboard(
  sheetName: ManagedSheetName,
  keys: readonly ColumnKey[],
  selection: GridSelection,
  projection?: RowProjection,
) {
  const readSelection = useCallback(() => {
    const bounds = selectionBounds(selection);
    const visibleRows = bounds
      ? Array.from({ length: bounds.height }, (_, offset) => bounds.y + offset)
      : selectionRowIndexes(selection);
    const rowIndexes = projection
      ? visibleRows.map((row) => realRowIndex(projection, row)).filter((row) => row >= 0)
      : visibleRows;
    const columnKeys = bounds ? selectionColumnKeys([...keys], bounds).keys : [...keys];
    return { rowIndexes, columnKeys };
  }, [keys, projection, selection]);

  const copy = useCallback(async (): Promise<boolean> => {
    const { rowIndexes, columnKeys } = readSelection();
    const sheet = useWorkbookStore.getState().data[sheetName];
    const matrix = matrixFromSheet(sheet, rowIndexes, columnKeys);
    return writeClipboard(serializeTsv(matrix), toHtmlTable(matrix));
  }, [readSelection, sheetName]);

  const cut = useCallback(async (): Promise<boolean> => {
    const { rowIndexes, columnKeys } = readSelection();
    const sheet = useWorkbookStore.getState().data[sheetName];
    const matrix = matrixFromSheet(sheet, rowIndexes, columnKeys);
    if (!(await writeClipboard(serializeTsv(matrix), toHtmlTable(matrix)))) return false;

    const typeKey = findColumnKey(sheet, 'type') ?? 'type';
    const edits = rowIndexes.flatMap((rowIndex) => {
      const row = sheet.rows[rowIndex];
      if (!row) return [];
      return columnKeys
        .filter((column) => isCellEditable(row.cells[typeKey] ?? '', column))
        .map((column) => ({ rowId: row.id, column, value: '' }));
    });
    if (edits.length > 0) {
      useWorkbookStore
        .getState()
        .apply(
          `Cut ${edits.length} cell${edits.length === 1 ? '' : 's'}`,
          (data) => setCells(data, sheetName, edits),
          {
            sheet: sheetName,
            rowIds: [...new Set(edits.map((edit) => edit.rowId))],
            columns: [...new Set(edits.map((edit) => edit.column))],
          },
        );
    }
    return true;
  }, [readSelection, sheetName]);

  const paste = useCallback(
    async (target: ClipboardTarget): Promise<boolean> => {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast.error('Could not read the clipboard', {
          description: 'Use Ctrl+V inside the grid instead.',
        });
        return false;
      }
      const matrix = parseTsv(text);
      if (matrix.length === 0) return false;

      let result: ReturnType<typeof pasteMatrix> | undefined;
      const cellCount = matrix.reduce((total, row) => total + row.length, 0);
      const width = matrix[0]?.length ?? 0;
      const columns = [...keys].slice(target.columnIndex, target.columnIndex + width);
      const meta: { sheet: ManagedSheetName; rowIds: RowId[]; columns: ColumnKey[] } = {
        sheet: sheetName,
        rowIds: [],
        columns,
      };
      useWorkbookStore.getState().apply(
        `Paste ${cellCount} cell${cellCount === 1 ? '' : 's'}`,
        (data) => {
          result = pasteMatrix(data, sheetName, target, matrix, [...keys], {
            ...(projection ? { rowIndexes: projection.realIndexes } : {}),
          });
          meta.rowIds = result.rowIds;
          return result.data;
        },
        meta,
      );
      if (result?.droppedColumns) {
        toast.warning(`Dropped ${result.droppedColumns} column(s) past the last column.`);
      }
      if (result?.skippedReadOnly) {
        toast.warning(`Skipped ${result.skippedReadOnly} read-only cell(s).`);
      }
      return (result?.applied ?? 0) > 0;
    },
    [keys, projection, sheetName],
  );

  return { copy, cut, paste };
}
