/** Column header menu and rename dialog (Task 2.6). */
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ColumnKey, ManagedSheetName, WorkbookData } from '@/core/model/types';
import { removeColumn, renameColumn } from '@/core/ops/columns';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { AddColumnDialog } from './AddColumnDialog';

export interface HeaderMenuState {
  x: number;
  y: number;
  column: ColumnKey;
}

export function HeaderMenu({
  sheet,
  state,
  onClose,
}: {
  sheet: ManagedSheetName;
  state: HeaderMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [addAt, setAddAt] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [state, onClose]);

  if (!state) {
    return addAt === null ? null : (
      <AddColumnDialog
        open
        onOpenChange={(open) => {
          if (!open) setAddAt(null);
        }}
        sheet={sheet}
        atIndex={addAt}
      />
    );
  }

  const column = state.column;
  const apply = (label: string, update: (data: WorkbookData) => WorkbookData) => {
    useWorkbookStore.getState().apply(label, update, { sheet });
  };

  const deleteColumn = () => {
    const data = useWorkbookStore.getState().data;
    const hasData = data[sheet].rows.some((row) => (row.cells[column] ?? '') !== '');
    if (hasData && !window.confirm(`Delete "${column}" and all of its data?`)) return;
    apply(`Delete column "${column}"`, (current) => removeColumn(current, sheet, column));
    onClose();
  };

  const openRename = () => {
    setRenameValue(column);
    setError(null);
    setRenameOpen(true);
  };

  const rename = () => {
    const next = renameValue.trim();
    const data = useWorkbookStore.getState().data;
    if (!next) {
      setError('Enter a column header.');
      return;
    }
    if (next !== column && data[sheet].columns.includes(next)) {
      setError(`"${next}" already exists in this sheet.`);
      return;
    }
    apply(`Rename column to "${next}"`, (current) => renameColumn(current, sheet, column, next));
    setRenameOpen(false);
    onClose();
  };

  const item = (label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="hover:bg-accent flex w-full items-center px-3 py-1.5 text-left text-sm"
      onClick={run}
    >
      {label}
    </button>
  );

  const fileIndex = useWorkbookStore.getState().data[sheet].columns.indexOf(column);

  return (
    <>
      <div
        ref={ref}
        role="menu"
        data-testid="header-menu"
        className="bg-popover text-popover-foreground fixed z-50 min-w-52 rounded-md border py-1 shadow-lg"
        style={{
          left: Math.min(state.x, window.innerWidth - 220),
          top: Math.min(state.y, window.innerHeight - 240),
        }}
      >
        {item('Add column left', () => {
          setAddAt(fileIndex);
          onClose();
        })}
        {item('Add column right', () => {
          setAddAt(fileIndex + 1);
          onClose();
        })}
        {item('Rename header…', openRename)}
        {item('Hide column', () => {
          useUiStore.getState().toggleColumnHidden(sheet, column);
          onClose();
        })}
        <div className="my-1 border-t" />
        {item('Delete column', deleteColumn)}
      </div>

      {addAt !== null ? (
        <AddColumnDialog
          open
          onOpenChange={(open) => {
            if (!open) setAddAt(null);
          }}
          sheet={sheet}
          atIndex={addAt}
        />
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent data-testid="rename-column-dialog">
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
            <DialogDescription>
              Data moves with the header; the saved file uses the new name.
            </DialogDescription>
          </DialogHeader>
          <input
            data-testid="rename-column-input"
            className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            value={renameValue}
            autoFocus
            onChange={(event) => {
              setRenameValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') rename();
            }}
          />
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={rename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
