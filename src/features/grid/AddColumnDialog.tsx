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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KNOWN_XLSFORM_COLUMNS, resolveColumn } from '@/core/model/columns';
import type { ManagedSheetName } from '@/core/model/types';
import { addColumn } from '@/core/ops/columns';
import { useWorkbookStore } from '@/state/workbookStore';

const CUSTOM_HEADER = '__custom__';

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
  const [choice, setChoice] = useState('');
  const [customHeader, setCustomHeader] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const custom = choice === CUSTOM_HEADER;
  const value = custom ? customHeader : choice;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setChoice('');
      setCustomHeader('');
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
            Pick a standard XLSForm header, or choose Custom header to type any name.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={custom ? `${fieldId}-input` : fieldId} className="text-sm font-medium">
            Header
          </label>
          <Select
            value={choice}
            onValueChange={(next) => {
              setChoice(next);
              if (next !== CUSTOM_HEADER) setCustomHeader('');
              setError(null);
            }}
          >
            <SelectTrigger
              id={fieldId}
              data-testid="add-column-select"
              className="w-full"
              autoFocus={!custom}
            >
              <SelectValue placeholder="Choose a header…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={CUSTOM_HEADER}>Custom header…</SelectItem>
              <SelectSeparator />
              {KNOWN_XLSFORM_COLUMNS.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {custom ? (
            <input
              id={`${fieldId}-input`}
              data-testid="add-column-input"
              className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              value={customHeader}
              autoFocus
              placeholder="Type any header"
              onChange={(event) => {
                setCustomHeader(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          ) : null}
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
