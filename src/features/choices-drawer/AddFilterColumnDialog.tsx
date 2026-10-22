/** Add a cascading filter column to the choices sheet (Task 3.6). */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { findColumnKey } from '@/core/indexes/columns';
import { parseType } from '@/core/model/parseType';
import type { RowId } from '@/core/model/types';
import { addFilterColumn } from '@/core/ops/choices';
import { useWorkbookStore } from '@/state/workbookStore';

function suggestedParent(surveyRowId: RowId | null): string {
  if (!surveyRowId) return '';
  const sheet = useWorkbookStore.getState().data.survey;
  const typeKey = findColumnKey(sheet, 'type') ?? 'type';
  const nameKey = findColumnKey(sheet, 'name') ?? 'name';
  const index = sheet.rows.findIndex((row) => row.id === surveyRowId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const row = sheet.rows[cursor];
    if (!row) continue;
    const parsed = parseType(row.cells[typeKey] ?? '');
    const name = (row.cells[nameKey] ?? '').trim();
    if (parsed.listName && name) return name;
  }
  return '';
}

function existingFilterFor(surveyRowId: RowId | null): string {
  if (!surveyRowId) return '';
  const sheet = useWorkbookStore.getState().data.survey;
  const filterKey = findColumnKey(sheet, 'choice_filter') ?? 'choice_filter';
  return sheet.rows.find((row) => row.id === surveyRowId)?.cells[filterKey] ?? '';
}

function FilterForm({
  listName,
  surveyRowId,
  parent,
  existingFilter,
  onDone,
}: {
  listName: string;
  surveyRowId: RowId | null;
  parent: string;
  existingFilter: string;
  onDone: () => void;
}) {
  const [column, setColumn] = useState(parent);
  const [scaffold, setScaffold] = useState(true);
  const [append, setAppend] = useState(false);

  const submit = () => {
    const trimmed = column.trim();
    if (!trimmed) return;
    useWorkbookStore.getState().apply(
      'Add filter column',
      (data) =>
        addFilterColumn(data, trimmed, {
          ...(surveyRowId ? { surveyRowId } : {}),
          ...(parent ? { parentName: parent } : {}),
          append,
        }).data,
      { sheet: 'choices', ...(surveyRowId ? { rowIds: [surveyRowId] } : {}) },
    );
    toast.success(`Added "${trimmed}" to ${listName}`);
    onDone();
  };

  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        Column name
        <input
          className="border-input bg-background rounded border px-2 py-1 font-mono text-sm"
          value={column}
          onChange={(event) => setColumn(event.target.value)}
          placeholder="province_id"
          data-testid="filter-column-name"
          autoFocus
        />
      </label>
      {parent ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={scaffold}
            onChange={(event) => setScaffold(event.target.checked)}
            data-testid="scaffold-filter"
          />
          Scaffold{' '}
          <code>
            {column || 'column'} = ${`{${parent}}`}
          </code>{' '}
          on the active question
        </label>
      ) : null}
      {scaffold && existingFilter ? (
        <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <input
            type="checkbox"
            checked={append}
            onChange={(event) => setAppend(event.target.checked)}
            data-testid="append-filter"
          />
          Append with <code>and</code> to the existing filter “{existingFilter}”
        </label>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={column.trim() === ''} data-testid="add-filter-submit">
          Add column
        </Button>
      </DialogFooter>
    </>
  );
}

export function AddFilterColumnDialog({
  open,
  onOpenChange,
  listName,
  surveyRowId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
  surveyRowId: RowId | null;
}) {
  const parent = useMemo(() => suggestedParent(surveyRowId), [surveyRowId]);
  const existingFilter = useMemo(() => existingFilterFor(surveyRowId), [surveyRowId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-filter-column-dialog">
        <DialogHeader>
          <DialogTitle>Add filter column</DialogTitle>
          <DialogDescription>
            Adds a column to the {listName} list for cascading selects.
          </DialogDescription>
        </DialogHeader>
        <FilterForm
          key={`${surveyRowId ?? 'none'}:${parent}:${existingFilter}`}
          listName={listName}
          surveyRowId={surveyRowId}
          parent={parent}
          existingFilter={existingFilter}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
