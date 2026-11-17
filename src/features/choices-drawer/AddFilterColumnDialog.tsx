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
import { primaryLabelColumn } from '@/core/languages/discover';
import { parseType } from '@/core/model/parseType';
import type { RowId } from '@/core/model/types';
import { addFilterColumn } from '@/core/ops/choices';
import { useWorkbookStore } from '@/state/workbookStore';

interface ParentQuestionOption {
  name: string;
  listName: string;
  label: string;
}

function parentQuestions(surveyRowId: RowId | null): ParentQuestionOption[] {
  const data = useWorkbookStore.getState().data;
  const sheet = data.survey;
  const typeKey = findColumnKey(sheet, 'type') ?? 'type';
  const nameKey = findColumnKey(sheet, 'name') ?? 'name';
  const labelKey = primaryLabelColumn(sheet, data);
  const index = surveyRowId ? sheet.rows.findIndex((row) => row.id === surveyRowId) : -1;

  const toOption = (rowIndex: number): ParentQuestionOption | null => {
    const row = sheet.rows[rowIndex];
    if (!row || row.id === surveyRowId) return null;
    const parsed = parseType(row.cells[typeKey] ?? '');
    const name = (row.cells[nameKey] ?? '').trim();
    if (!parsed.listName || !name) return null;
    const label = labelKey ? (row.cells[labelKey] ?? '').trim() : '';
    return { name, listName: parsed.listName, label };
  };

  const options: ParentQuestionOption[] = [];
  const start = index >= 0 ? index - 1 : sheet.rows.length - 1;
  for (let cursor = start; cursor >= 0; cursor -= 1) {
    const option = toOption(cursor);
    if (option) options.push(option);
  }
  if (index >= 0) {
    for (let cursor = index + 1; cursor < sheet.rows.length; cursor += 1) {
      const option = toOption(cursor);
      if (option) options.push(option);
    }
  }
  return options;
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
  parents,
  existingFilter,
  onDone,
}: {
  listName: string;
  surveyRowId: RowId | null;
  parents: ParentQuestionOption[];
  existingFilter: string;
  onDone: () => void;
}) {
  const initialParent = parents[0]?.name ?? '';
  const [selectedParent, setSelectedParent] = useState(initialParent);
  const [column, setColumn] = useState(initialParent);
  const [columnEdited, setColumnEdited] = useState(false);
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
          ...(scaffold && selectedParent ? { parentName: selectedParent } : {}),
          append,
        }).data,
      { sheet: 'choices', ...(surveyRowId ? { rowIds: [surveyRowId] } : {}) },
    );
    toast.success(`Added "${trimmed}" to ${listName}`);
    onDone();
  };

  return (
    <>
      {parents.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs">
          Parent select question
          <select
            className="border-input bg-background rounded border px-2 py-1 text-sm"
            value={selectedParent}
            onChange={(event) => {
              const nextParent = event.target.value;
              const prevParent = selectedParent;
              setSelectedParent(nextParent);
              if (!columnEdited || column === prevParent) {
                setColumn(nextParent);
              }
            }}
            data-testid="parent-question-select"
          >
            {parents.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.name} ({opt.listName}){opt.label ? ` — ${opt.label}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-xs">
        Column name
        <input
          className="border-input bg-background rounded border px-2 py-1 font-mono text-sm"
          value={column}
          onChange={(event) => {
            setColumnEdited(true);
            setColumn(event.target.value);
          }}
          placeholder="province_id"
          data-testid="filter-column-name"
          autoFocus
        />
      </label>
      {selectedParent ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={scaffold}
            onChange={(event) => setScaffold(event.target.checked)}
            data-testid="scaffold-filter"
          />
          Scaffold{' '}
          <code>
            {column || 'column'} = ${`{${selectedParent}}`}
          </code>{' '}
          on the active question
        </label>
      ) : null}
      {scaffold && selectedParent && existingFilter ? (
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
  const parents = useMemo(() => (open ? parentQuestions(surveyRowId) : []), [open, surveyRowId]);
  const existingFilter = useMemo(
    () => (open ? existingFilterFor(surveyRowId) : ''),
    [open, surveyRowId],
  );

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
          key={`${surveyRowId ?? 'none'}:${parents[0]?.name ?? ''}:${existingFilter}`}
          listName={listName}
          surveyRowId={surveyRowId}
          parents={parents}
          existingFilter={existingFilter}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
