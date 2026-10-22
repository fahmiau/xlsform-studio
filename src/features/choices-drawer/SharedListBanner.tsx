/** Shared-list pill with Fork / Edit Shared actions (Task 3.6). */
import { useMemo, useState } from 'react';
import { Copy, Pencil, Users } from 'lucide-react';
import { toast } from 'sonner';

import type { RowId } from '@/core/model/types';
import { forkList, listUsageDetails } from '@/core/ops/choices';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export function SharedListBanner({
  listName,
  surveyRowId,
}: {
  listName: string;
  surveyRowId: RowId | null;
}) {
  const data = useWorkbookStore((state) => state.data);
  const dismissed = useUiStore((state) => state.dismissedSharedLists);
  const [expanded, setExpanded] = useState(false);
  const usage = useMemo(
    () => (surveyRowId ? listUsageDetails(data, listName) : []),
    [data, listName, surveyRowId],
  );

  if (usage.length <= 1 || dismissed.has(listName) || !surveyRowId) return null;

  const fork = () => {
    let newName = listName;
    useWorkbookStore.getState().apply(
      'Fork choice list',
      (current) => {
        const result = forkList(current, listName, surveyRowId);
        newName = result.newListName;
        return result.data;
      },
      { sheet: 'survey', rowIds: [surveyRowId] },
    );
    if (newName !== listName) toast.success(`Forked "${listName}" to "${newName}"`);
  };

  return (
    <div
      className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
      data-testid="shared-list-banner"
    >
      <div className="flex items-center gap-1.5">
        <Users aria-hidden className="size-3.5 shrink-0" />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          data-testid="shared-list-toggle"
        >
          Used by {usage.length} questions — {listName}
        </button>
        <button
          type="button"
          className="hover:bg-sky-200/60 flex items-center gap-0.5 rounded px-1 py-0.5"
          onClick={fork}
          data-testid="fork-list"
        >
          <Copy aria-hidden className="size-3" /> Fork List
        </button>
        <button
          type="button"
          className="hover:bg-sky-200/60 flex items-center gap-0.5 rounded px-1 py-0.5"
          onClick={() => useUiStore.getState().dismissSharedList(listName)}
          data-testid="edit-shared"
        >
          <Pencil aria-hidden className="size-3" /> Edit Shared
        </button>
      </div>
      {expanded ? (
        <ul className="mt-1 space-y-0.5 border-t border-sky-200 pt-1 dark:border-sky-800">
          {usage.map((entry) => (
            <li key={entry.rowId}>
              <button
                type="button"
                className="hover:underline"
                onClick={() => useUiStore.getState().requestReveal('survey', entry.rowId)}
              >
                {entry.name || '(unnamed)'}
                {entry.label ? ` — ${entry.label}` : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
