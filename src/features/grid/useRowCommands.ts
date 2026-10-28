/**
 * Row commands shared by shortcuts and the row context menu (Task 2.4). Every
 * user action is one store `apply`, hence one undo step (AD-2).
 */
import { findColumnKey } from '@/core/indexes/columns';
import type { ManagedSheetName, RowId } from '@/core/model/types';
import { deleteRows, duplicateRows, insertRows } from '@/core/ops/rows';
import { clampIndex } from '@/core/ops/rows';
import type { AppCommand } from '@/lib/commands';
import { useUiStore, type SheetTab } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

function currentSheet(): SheetTab {
  return useUiStore.getState().activeSheet;
}

export function selectedRowIds(sheet: SheetTab = currentSheet()): RowId[] {
  const data = useWorkbookStore.getState().data;
  const ui = useUiStore.getState();
  const ids = ui.selectedRowIds.filter((id) => data[sheet].rows.some((row) => row.id === id));
  if (ids.length > 0) return ids;
  const active = ui.activeCell;
  return active && active.sheet === sheet ? [active.rowId] : [];
}

function selectionIndex(sheet: SheetTab, rowIds: readonly RowId[]): number {
  const rows = useWorkbookStore.getState().data[sheet].rows;
  const indexes = rowIds
    .map((id) => rows.findIndex((row) => row.id === id))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : rows.length;
}

function focusRows(sheet: SheetTab, rowIds: readonly RowId[]): void {
  const first = rowIds[0];
  if (!first) return;
  const data = useWorkbookStore.getState().data;
  const column = findColumnKey(data[sheet], 'name') ?? data[sheet].columns[0];
  if (!column) return;
  useUiStore.getState().setSelectedRowIds([...rowIds]);
  useUiStore.getState().setActiveCell({ sheet, rowId: first, column });
  useUiStore.getState().requestReveal(sheet, first);
}

export function insertRowsAtSelection(position: 'above' | 'below', count = 1): RowId[] {
  const sheet = currentSheet();
  if (sheet === 'settings') return [];
  const rows = selectedRowIds();
  const index = rows.length > 0 ? selectionIndex(sheet, rows) : 0;
  const rowCount = useWorkbookStore.getState().data[sheet].rows.length;
  const at = clampIndex(position === 'above' ? index : index + 1, rowCount);
  let inserted: RowId[] = [];
  const meta: { sheet: ManagedSheetName; rowIds: RowId[] } = { sheet, rowIds: [] };

  useWorkbookStore.getState().apply(
    `Insert ${count} row${count === 1 ? '' : 's'} ${position}`,
    (data) => {
      const next = insertRows(
        data,
        sheet,
        at,
        Array.from({ length: count }, () => ({ cells: {} })),
      );
      inserted = next[sheet].rows.slice(at, at + count).map((row) => row.id);
      meta.rowIds = inserted;
      return next;
    },
    meta,
  );

  if (inserted.length > 0) focusRows(sheet, inserted);
  return inserted;
}

export function duplicateSelectedRows(): RowId[] {
  const sheet = currentSheet();
  if (sheet === 'settings') return [];
  const selected = selectedRowIds();
  if (selected.length === 0) return [];
  const before = new Set(useWorkbookStore.getState().data[sheet].rows.map((row) => row.id));
  let created: RowId[] = [];
  const meta: { sheet: ManagedSheetName; rowIds: RowId[] } = { sheet, rowIds: [] };

  useWorkbookStore.getState().apply(
    `Duplicate ${selected.length} row${selected.length === 1 ? '' : 's'}`,
    (data) => {
      const next = duplicateRows(data, sheet, selected);
      created = next[sheet].rows.map((row) => row.id).filter((id) => !before.has(id));
      meta.rowIds = created;
      return next;
    },
    meta,
  );

  if (created.length > 0) focusRows(sheet, created);
  return created;
}

export function deleteSelectedRows(sheet: SheetTab = currentSheet()): RowId[] {
  if (sheet === 'settings') return [];
  const selected = selectedRowIds(sheet);
  if (selected.length === 0) return [];
  const index = selectionIndex(sheet, selected);
  const meta: { sheet: ManagedSheetName; rowIds: RowId[] } = { sheet, rowIds: [] };

  useWorkbookStore.getState().apply(
    `Delete ${selected.length} row${selected.length === 1 ? '' : 's'}`,
    (data) => {
      const next = deleteRows(data, sheet, selected);
      const target = next[sheet].rows[Math.min(index, next[sheet].rows.length - 1)];
      meta.rowIds = target ? [target.id] : [];
      return next;
    },
    meta,
  );

  const nextRows = useWorkbookStore.getState().data[sheet].rows;
  const target = nextRows[Math.min(index, nextRows.length - 1)];
  // A drawer delete on `choices` must not pull the survey tab along, so only
  // re-focus the survivors when that sheet is the one on screen.
  if (target && sheet === currentSheet()) focusRows(sheet, [target.id]);
  else useUiStore.getState().setSelectedRowIds([]);
  return selected;
}

export function insertRowsAt(index: number, count: number): RowId[] {
  const sheet = currentSheet();
  if (sheet === 'settings') return [];
  const rowCount = useWorkbookStore.getState().data[sheet].rows.length;
  const at = clampIndex(index, rowCount);
  let inserted: RowId[] = [];
  const meta: { sheet: ManagedSheetName; rowIds: RowId[] } = { sheet, rowIds: [] };
  useWorkbookStore.getState().apply(
    `Insert ${count} row${count === 1 ? '' : 's'}`,
    (data) => {
      const next = insertRows(
        data,
        sheet,
        at,
        Array.from({ length: count }, () => ({ cells: {} })),
      );
      inserted = next[sheet].rows.slice(at, at + count).map((row) => row.id);
      meta.rowIds = inserted;
      return next;
    },
    meta,
  );
  if (inserted.length > 0) focusRows(sheet, inserted);
  return inserted;
}

export function selectionRowIndex(): number {
  return selectionIndex(currentSheet(), selectedRowIds());
}

/** Insert-row commands, shared by shortcuts and the palette (Task 2.4). */
export function rowCommands(): AppCommand[] {
  return [
    {
      id: 'grid.row.insertBelow',
      title: 'Insert row below',
      shortcut: { code: 'KeyI', ctrlOrMeta: true },
      when: () => currentSheet() !== 'settings',
      run: () => {
        insertRowsAtSelection('below');
      },
    },
    {
      id: 'grid.row.insertAbove',
      title: 'Insert row above',
      shortcut: { code: 'KeyI', ctrlOrMeta: true, shift: true },
      when: () => currentSheet() !== 'settings',
      run: () => {
        insertRowsAtSelection('above');
      },
    },
  ];
}
