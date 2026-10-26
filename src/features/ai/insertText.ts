/**
 * "Insert into Active Cell" for Chat Mode (Task 6.5).
 *
 * One `apply` call → one undo entry. Refuses when no cell is active, the sheet
 * has no such column, or the row/column is structurally read-only.
 */
import { setCells } from '@/core/ops/cells';
import { isCellEditable } from '@/features/grid/editability';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export interface InsertResult {
  ok: boolean;
  reason?: string;
}

export function insertIntoActiveCell(text: string): InsertResult {
  const cell = useUiStore.getState().activeCell;
  if (!cell) return { ok: false, reason: 'Select a cell first.' };
  if (cell.sheet === 'settings') return { ok: false, reason: 'Settings uses a form view.' };

  const data = useWorkbookStore.getState().data;
  const sheet = data[cell.sheet];
  if (!sheet.columns.includes(cell.column)) {
    return { ok: false, reason: 'That column no longer exists.' };
  }
  const row = sheet.rows.find((candidate) => candidate.id === cell.rowId);
  if (!row) return { ok: false, reason: 'That row no longer exists.' };
  const typeColumn = sheet.columns.find((column) => column.toLowerCase() === 'type') ?? 'type';
  if (!isCellEditable(row.cells[typeColumn] ?? '', cell.column)) {
    return { ok: false, reason: 'That cell is read-only.' };
  }

  useWorkbookStore
    .getState()
    .apply(
      'Insert AI text',
      (current) =>
        setCells(current, cell.sheet, [{ rowId: cell.rowId, column: cell.column, value: text }]),
      { sheet: cell.sheet, rowIds: [cell.rowId] },
    );
  return { ok: true };
}
