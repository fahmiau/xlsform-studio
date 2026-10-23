/** In-grid folding shortcuts (Task 3.7): Ctrl+[ collapse, Ctrl+] expand. */
import { toast } from 'sonner';

import { buildGroupTree } from '@/core/indexes/groupTree';
import { groupContainingRow } from '@/core/ops/groups';
import type { AppCommand } from '@/lib/commands';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

function activeSurveyRowId(): string | undefined {
  const ui = useUiStore.getState();
  if (ui.activeCell?.sheet === 'survey') return ui.activeCell.rowId;
  return ui.selectedRowIds[0];
}

function activeGroup() {
  const rowId = activeSurveyRowId();
  if (!rowId) return undefined;
  const sheet = useWorkbookStore.getState().data.survey;
  const rowIndex = sheet.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0) return undefined;
  const tree = buildGroupTree(sheet);
  return groupContainingRow(tree.groups, rowIndex);
}

export function collapseActiveGroup(): void {
  const group = activeGroup();
  if (!group) {
    toast.info('No group at the active row');
    return;
  }
  if (group.endRowIndex < 0) {
    toast.info('This group is never closed', {
      description: 'Add its matching end row first (lint rule XLS-003).',
    });
    return;
  }
  if (!useUiStore.getState().collapsedGroupIds.has(group.id)) {
    useUiStore.getState().toggleGroupCollapsed(group.id);
  }
}

export function expandActiveGroup(): void {
  const group = activeGroup();
  if (!group) {
    toast.info('No group at the active row');
    return;
  }
  if (useUiStore.getState().collapsedGroupIds.has(group.id)) {
    useUiStore.getState().toggleGroupCollapsed(group.id);
  }
}

/** Folding commands, shared by shortcuts and the palette (Task 3.7). */
export function foldingCommands(): AppCommand[] {
  return [
    {
      id: 'grid.group.collapse',
      title: 'Collapse group',
      shortcut: { code: 'BracketLeft', ctrlOrMeta: true },
      run: collapseActiveGroup,
    },
    {
      id: 'grid.group.expand',
      title: 'Expand group',
      shortcut: { code: 'BracketRight', ctrlOrMeta: true },
      run: expandActiveGroup,
    },
  ];
}
