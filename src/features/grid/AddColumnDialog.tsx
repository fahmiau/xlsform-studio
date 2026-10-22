/** Add-column dialog (Task 2.6). */
import { useId, useState } from 'react';
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
import { KNOWN_XLSFORM_COLUMNS, resolveColumn } from '@/core/model/columns';
import type { ManagedSheetName } from '@/core/model/types';
import { addColumn } from '@/core/ops/columns';
import { useWorkbookStore } from '@/state/workbookStore';

export function AddColumnDialog({
  open,
  onOpenChange,
  sheet,
  atIndex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: ManagedSheetName;
  atIndex?: number;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setValue('');
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = () => {
    const header = value.trim();
    if (!header) {
      setError('Enter a column header.');
      return;
    }
    const data = useWorkbookStore.getState().data;
    if (data[sheet].columns.includes(header)) {
      setError(`"${header}" already exists in this sheet.`);
      return;
    }
    useWorkbookStore
      .getState()
      .apply(`Add column "${header}"`, (current) => addColumn(current, sheet, header, atIndex), {
        sheet,
      });
    toast.success(`Added ${resolveColumn(header).canonical} column`);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="add-column-dialog">
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
          <DialogDescription>
            Standard XLSForm columns are suggested; any custom header is allowed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${listId}-input`} className="text-sm font-medium">
            Header
          </label>
          <input
            id={`${listId}-input`}
            data-testid="add-column-input"
            className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            list={listId}
            value={value}
            autoFocus
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <datalist id={listId}>
            {KNOWN_XLSFORM_COLUMNS.map((column) => (
              <option key={column} value={column} />
            ))}
          </datalist>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} data-testid="add-column-confirm">
            Add column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
