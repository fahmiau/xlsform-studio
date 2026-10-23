/** Drawer header: question, editable list name, and naming mode (Tasks 3.4, 5.2). */
import { useMemo, useState } from 'react';
import { ListTree, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { findColumnKey } from '@/core/indexes/columns';
import { primaryLabelColumn } from '@/core/languages/discover';
import type { RowId } from '@/core/model/types';
import { listRenameError, renameList } from '@/core/refactor/renameList';
import type { ListMode } from '@/core/slug/slugify';
import { useWorkbookStore } from '@/state/workbookStore';

import { ModeToggle } from './ModeToggle';

export function DrawerHeader({
  listName,
  surveyRowId,
  mode,
  onModeChange,
}: {
  listName: string;
  surveyRowId: RowId | null;
  mode: ListMode;
  onModeChange: (mode: ListMode) => void;
}) {
  const data = useWorkbookStore((state) => state.data);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(listName);

  const row = useMemo(
    () =>
      surveyRowId ? data.survey.rows.find((candidate) => candidate.id === surveyRowId) : undefined,
    [data.survey.rows, surveyRowId],
  );
  const nameKey = findColumnKey(data.survey, 'name') ?? 'name';
  const labelKey = primaryLabelColumn(data.survey, data) ?? nameKey;
  const name = row?.cells[nameKey] ?? '';
  const label = row?.cells[labelKey] ?? '';

  const commitListName = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === listName) return;
    const error = listRenameError(data, listName, next);
    if (error) {
      toast.error('List name not changed', { description: error });
      setDraft(listName);
      return;
    }
    let changes = 0;
    useWorkbookStore.getState().apply(
      'Rename choice list',
      (current) => {
        const result = renameList(current, listName, next);
        changes = result.changes.length;
        return result.data;
      },
      { sheet: 'choices' },
    );
    if (changes > 0) {
      toast.success(`Renamed list ${listName} → ${next}`, {
        description: `Updated ${changes} cell${changes === 1 ? '' : 's'}.`,
        action: {
          label: 'Undo',
          onClick: () => useWorkbookStore.temporal.getState().undo(),
        },
      });
    }
  };

  return (
    <div className="space-y-1 border-b px-2 py-1.5" data-testid="drawer-header">
      <div className="flex items-start gap-1.5">
        <ListTree aria-hidden className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{label || '(no label)'}</div>
          <div className="text-muted-foreground truncate font-mono text-[11px]">
            {name || '(no name)'}
          </div>
        </div>
        <ModeToggle listName={listName} mode={mode} onChange={onModeChange} />
      </div>
      <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
        <span>list</span>
        {editing ? (
          <input
            autoFocus
            aria-label="List name"
            className="border-input bg-background w-40 rounded border px-1 font-mono"
            value={draft}
            data-testid="drawer-list-name-input"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitListName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitListName();
              if (event.key === 'Escape') {
                setDraft(listName);
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <code
              className="bg-muted rounded px-1 font-mono"
              data-testid="drawer-list-name"
              onDoubleClick={() => {
                setDraft(listName);
                setEditing(true);
              }}
            >
              {listName}
            </code>
            <button
              type="button"
              aria-label="Rename list"
              className="hover:text-foreground"
              data-testid="rename-list"
              onClick={() => {
                setDraft(listName);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden className="size-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
