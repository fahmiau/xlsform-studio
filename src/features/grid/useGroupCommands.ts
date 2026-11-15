/**
 * Wrap/unwrap/delete-group commands (Task 3.8). Every command is one store
 * `apply`, so one undo step.
 */
import { toast } from 'sonner';

import { buildGroupTree } from '@/core/indexes/groupTree';
import { findColumnKey } from '@/core/indexes/columns';
import { parseType } from '@/core/model/parseType';
import {
  checkSelectionBalance,
  deleteGroupWithContents,
  suggestGroupName,
  unwrapGroup,
  wrapSelection,
} from '@/core/ops/groups';
import type { AppCommand } from '@/lib/commands';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { deleteSelectedRows, selectedRowIds } from './useRowCommands';

function contiguousSelection(): { start: number; end: number; rowIds: string[] } | null {
  if (useUiStore.getState().activeSheet !== 'survey') return null;
  const sheet = useWorkbookStore.getState().data.survey;
  const ids = selectedRowIds();
  if (ids.length === 0) return null;
  const indexes = ids
    .map((id) => sheet.rows.findIndex((row) => row.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indexes.length === 0) return null;
  const start = indexes[0] ?? 0;
  const end = indexes[indexes.length - 1] ?? start;
  if (end - start + 1 !== indexes.length) return null;
  return { start, end, rowIds: ids };
}

export function wrapSelectedRows(kind: 'group' | 'repeat'): void {
  const selection = contiguousSelection();
  if (!selection) {
    toast.error('Select a contiguous block of rows first');
    return;
  }
  const data = useWorkbookStore.getState().data;
  const balance = checkSelectionBalance(data.survey, selection.start, selection.end);
  if (!balance.ok) {
    toast.error('Cannot wrap this selection', { description: balance.reason });
    return;
  }
  const name = suggestGroupName(data, kind);
  let rowId: string | undefined;
  const meta: { sheet: 'survey'; rowIds: string[]; undoRowIds: string[]; columns: string[] } = {
    sheet: 'survey',
    rowIds: selection.rowIds,
    undoRowIds: selection.rowIds,
    columns: ['name'],
  };
  useWorkbookStore.getState().apply(
    kind === 'repeat' ? 'Wrap in repeat' : 'Wrap in group',
    (current) => {
      const result = wrapSelection(current, selection.start, selection.end, kind, { name });
      rowId = result.rowId;
      if (rowId) meta.rowIds = [rowId];
      return result.data;
    },
    meta,
  );
  if (!rowId) return;
  useUiStore.getState().setSelectedRowIds([rowId]);
  useUiStore.getState().setActiveCell({ sheet: 'survey', rowId, column: 'name' });
  useUiStore.getState().requestReveal('survey', rowId, { column: 'name' });
  toast.success(`Wrapped ${selection.end - selection.start + 1} rows in a ${kind}`, {
    description: `Name: ${name}. Edit it in the grid.`,
  });
}

export function unwrapGroupRow(rowId: string): void {
  const before = useWorkbookStore.getState().data.survey;
  const index = before.rows.findIndex((row) => row.id === rowId);
  const meta: { sheet: 'survey'; rowIds: string[]; undoRowIds: string[]; columns: string[] } = {
    sheet: 'survey',
    rowIds: [rowId],
    undoRowIds: [rowId],
    columns: ['type'],
  };
  useWorkbookStore.getState().apply(
    'Unwrap group',
    (data) => {
      const next = unwrapGroup(data, rowId);
      const target = next.survey.rows[Math.min(Math.max(0, index), next.survey.rows.length - 1)];
      meta.rowIds = target ? [target.id] : [];
      return next;
    },
    meta,
  );
}

export function deleteGroupRow(rowId: string): void {
  const before = useWorkbookStore.getState().data.survey;
  const index = before.rows.findIndex((row) => row.id === rowId);
  const meta: { sheet: 'survey'; rowIds: string[]; undoRowIds: string[]; columns: string[] } = {
    sheet: 'survey',
    rowIds: [],
    undoRowIds: [rowId],
    columns: ['name'],
  };
  useWorkbookStore.getState().apply(
    'Delete group and contents',
    (data) => {
      const next = deleteGroupWithContents(data, rowId);
      const target = next.survey.rows[Math.min(Math.max(0, index), next.survey.rows.length - 1)];
      meta.rowIds = target ? [target.id] : [];
      return next;
    },
    meta,
  );
}

/** Delete-key path: a lone begin row prompts for unwrap vs delete-with-contents. */
export function deleteRowsWithGroupPrompt(rowIds: readonly string[]): boolean {
  const sheet = useWorkbookStore.getState().data.survey;
  if (rowIds.length === 1) {
    const rowId = rowIds[0];
    const group = rowId
      ? buildGroupTree(sheet).groups.find((candidate) => candidate.id === rowId)
      : undefined;
    if (group) {
      if (group.endRowIndex < 0) {
        toast.error('This group is never closed', {
          description: 'Fix the missing end row first (XLS-003).',
        });
        return true;
      }
      const deleteContents = window.confirm(
        `"${group.name || '(unnamed)'}" is a ${group.groupType}. Delete the group and its contents?`,
      );
      if (deleteContents) {
        deleteGroupRow(group.id);
        return true;
      }
      const keepContents = window.confirm('Keep the contents and remove only the begin/end rows?');
      if (keepContents) unwrapGroupRow(group.id);
      return true;
    }
  }
  if (rowIds.length > 0) deleteSelectedRows();
  return true;
}

/** True when the row is a begin row; used by the context menu. */
export function isBeginRow(rowId: string | undefined): boolean {
  if (!rowId) return false;
  const sheet = useWorkbookStore.getState().data.survey;
  const row = sheet.rows.find((candidate) => candidate.id === rowId);
  if (!row) return false;
  const typeKey = findColumnKey(sheet, 'type') ?? 'type';
  const base = parseType(row.cells[typeKey] ?? '').base;
  return base === 'begin_group' || base === 'begin_repeat';
}

/**
 * Shift/Ctrl+Delete row delete. The choices drawer and the right-panel Choices
 * tab share the survey tab, so the owning grid is the active cell's sheet, not
 * `activeSheet` (and not `choiceDrawer.open`, which only the drawer sets).
 */
function deleteRowsForActiveGrid(): void {
  const ui = useUiStore.getState();
  const target = ui.activeCell?.sheet ?? ui.activeSheet;
  if (target === 'settings') return;
  if (target === 'choices') {
    deleteSelectedRows('choices');
    return;
  }
  deleteRowsWithGroupPrompt(selectedRowIds());
}

/** Wrap commands, shared by shortcuts and the palette (Task 3.8). */
export function groupCommands(): AppCommand[] {
  return [
    {
      id: 'grid.group.wrap',
      title: 'Wrap rows in group',
      shortcut: { code: 'KeyG', ctrlOrMeta: true },
      when: () => useUiStore.getState().activeSheet === 'survey',
      run: () => wrapSelectedRows('group'),
    },
    {
      id: 'grid.group.wrapRepeat',
      title: 'Wrap rows in repeat',
      shortcut: { code: 'KeyG', ctrlOrMeta: true, shift: true },
      when: () => useUiStore.getState().activeSheet === 'survey',
      run: () => wrapSelectedRows('repeat'),
    },
    // Plain Delete clears cells (Glide default); row delete keeps its own keys.
    {
      id: 'grid.row.delete',
      title: 'Delete selected rows',
      shortcut: { code: 'Delete', shift: true },
      run: deleteRowsForActiveGrid,
    },
    {
      id: 'grid.row.deleteCtrl',
      title: 'Delete selected rows',
      shortcut: { code: 'Delete', ctrlOrMeta: true },
      run: deleteRowsForActiveGrid,
    },
  ];
}
