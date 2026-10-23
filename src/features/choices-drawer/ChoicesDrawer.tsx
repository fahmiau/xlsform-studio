/**
 * Smart Choices Drawer (Tasks 3.4–3.6, AD-13). A compact `SheetGrid` bound to
 * the active survey question's list, with auto-naming, locks, bulk paste, the
 * shared-list banner, and cascading-filter columns.
 */
import { useState } from 'react';
import { AlertCircle, Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { findColumnKey } from '@/core/indexes/columns';
import { parseType } from '@/core/model/parseType';
import { Button } from '@/components/ui/button';
import type { CellEdit } from '@/core/ops/cells';
import { applyTypeChange, insertChoiceRow, suggestListName } from '@/core/ops/choices';
import type { ListMode } from '@/core/slug/slugify';
import { deleteRows, moveBlock } from '@/core/ops/rows';
import {
  applyCellEdits,
  applyListMode,
  type CellEditOutcome,
} from '@/features/grid/cellEditPipeline';
import { SheetGrid } from '@/features/grid/SheetGrid';
import { notifyCellEdits } from '@/features/shell/toasts';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { AddFilterColumnDialog } from './AddFilterColumnDialog';
import { DRAWER_GRID_CONFIG } from './drawerGridConfig';
import { DrawerHeader } from './DrawerHeader';
import { SharedListBanner } from './SharedListBanner';
import { useBoundList } from './useBoundList';
import { useDrawerPaste } from './useDrawerPaste';

export function ChoicesDrawer() {
  const bound = useBoundList();
  const [filterOpen, setFilterOpen] = useState(false);
  const listNamePattern = usePrefsStore((state) => state.listNamePattern);
  const slugMaxLength = usePrefsStore((state) => state.slugMaxLength);
  const paste = useDrawerPaste(bound.listName, bound.columns, bound.mode);

  if (!bound.surveyRowId) {
    return (
      <EmptyState message="Select a select_one, select_multiple, or rank question to manage its choices." />
    );
  }

  if (!bound.listName) {
    const bindFromName = () => {
      const data = useWorkbookStore.getState().data;
      const row = data.survey.rows.find((candidate) => candidate.id === bound.surveyRowId);
      if (!row) return;
      const nameKey = findColumnKey(data.survey, 'name') ?? 'name';
      const typeKey = findColumnKey(data.survey, 'type') ?? 'type';
      const questionName = (row.cells[nameKey] ?? '').trim();
      if (!questionName) {
        toast.info('Give the question a name first', {
          description: 'The list name is derived from the question name.',
        });
        return;
      }
      const parsed = parseType(row.cells[typeKey] ?? '');
      const base =
        parsed.base.startsWith('select_') || parsed.base === 'rank' ? parsed.base : 'select_one';
      const listName = suggestListName(
        data,
        bound.surveyRowId ?? undefined,
        questionName,
        listNamePattern,
        slugMaxLength,
      );
      useWorkbookStore
        .getState()
        .apply(
          'Bind choice list',
          (current) => applyTypeChange(current, row.id, `${base} ${listName}`),
          {
            sheet: 'survey',
            rowIds: [row.id],
          },
        );
    };
    return (
      <div className="space-y-2 p-3 text-xs" data-testid="drawer-empty">
        <p className="text-muted-foreground">
          This question has no choice list yet. Pick a list in the type editor, or bind one from its
          name.
        </p>
        <Button size="sm" variant="outline" onClick={bindFromName} data-testid="bind-list-button">
          Bind list from question name
        </Button>
      </div>
    );
  }

  const applyMode = (mode: ListMode) => {
    const listName = bound.listName;
    if (!listName) return;
    useUiStore.getState().setChoiceMode(listName, mode);
    let outcome: CellEditOutcome | undefined;
    useWorkbookStore.getState().apply(
      'Change choice naming mode',
      (data) => {
        outcome = applyListMode(data, listName, mode, slugMaxLength);
        return outcome.data;
      },
      { sheet: 'choices' },
    );
    if (outcome) notifyCellEdits(outcome);
  };

  const commitEdits = (edits: readonly CellEdit[]) => {
    if (!bound.listName) return;
    let outcome: CellEditOutcome | undefined;
    useWorkbookStore.getState().apply(
      `Edit ${edits.length} choice cell${edits.length === 1 ? '' : 's'}`,
      (data) => {
        outcome = applyCellEdits(data, 'choices', edits, {
          mode: bound.mode,
          maxLength: slugMaxLength,
        });
        return outcome.data;
      },
      { sheet: 'choices', rowIds: edits.map((edit) => edit.rowId) },
    );
    if (outcome) notifyCellEdits(outcome);
  };

  const appendRow = () => {
    if (!bound.listName) return null;
    let rowId: string | null = null;
    useWorkbookStore.getState().apply(
      'Add choice',
      (data) => {
        const result = insertChoiceRow(
          data,
          bound.listName ?? '',
          {},
          {
            mode: bound.mode,
            maxLength: slugMaxLength,
          },
        );
        rowId = result.rowId;
        return result.data;
      },
      { sheet: 'choices' },
    );
    return rowId;
  };

  const addRow = () => {
    const rowId = appendRow();
    if (!rowId) return;
    useUiStore.getState().setSelectedRowIds([rowId]);
    const column = bound.labelKey ?? bound.nameKey;
    useUiStore.getState().setActiveCell({ sheet: 'choices', rowId, column });
  };

  const moveRow = (fromVisible: number, toVisible: number) => {
    const fromReal = bound.rowIndexes[fromVisible];
    const toReal = bound.rowIndexes[toVisible];
    if (fromReal === undefined || toReal === undefined || fromVisible === toVisible) return;
    useWorkbookStore
      .getState()
      .apply(
        'Reorder choice',
        (data) =>
          moveBlock(
            data,
            'choices',
            fromReal,
            fromReal,
            toVisible > fromVisible ? toReal + 1 : toReal,
          ),
        { sheet: 'choices' },
      );
  };

  const deleteChoiceRows = () => {
    const selected = useUiStore.getState().selectedRowIds;
    if (selected.length === 0) return;
    useWorkbookStore
      .getState()
      .apply(
        `Delete ${selected.length} choice${selected.length === 1 ? '' : 's'}`,
        (data) => deleteRows(data, 'choices', selected),
        { sheet: 'choices' },
      );
    useUiStore.getState().setSelectedRowIds([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="choices-drawer">
      <DrawerHeader
        listName={bound.listName}
        surveyRowId={bound.surveyRowId}
        mode={bound.mode}
        onModeChange={applyMode}
      />
      <div className="space-y-1 px-2 py-1">
        <SharedListBanner listName={bound.listName} surveyRowId={bound.surveyRowId} />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={addRow}
            data-testid="add-choice"
          >
            <Plus aria-hidden className="size-3" /> Add choice
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setFilterOpen(true)}
            data-testid="add-filter-column"
          >
            <Filter aria-hidden className="size-3" /> Add filter column
          </Button>
          <span className="text-muted-foreground ml-auto text-[11px]" data-testid="choice-count">
            {bound.rows.length} choices
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1" data-testid="drawer-grid-host">
        <SheetGrid
          sheetName="choices"
          config={DRAWER_GRID_CONFIG}
          rowIndexes={bound.rowIndexes}
          columnKeys={bound.columns}
          onCommitEdits={commitEdits}
          onPasteMatrix={(_row, matrix) => paste(matrix)}
          onAppendRow={appendRow}
          onMoveRow={moveRow}
          onDeleteRows={deleteChoiceRows}
          compact
        />
      </div>
      <AddFilterColumnDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        listName={bound.listName}
        surveyRowId={bound.surveyRowId}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs"
      data-testid="drawer-empty"
    >
      <AlertCircle aria-hidden className="size-5" />
      <p className="max-w-56">{message}</p>
    </div>
  );
}
