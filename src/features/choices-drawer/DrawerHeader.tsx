/** Drawer header: question, bound list name, and naming mode (Task 3.4). */
import { useMemo } from 'react';

import { findColumnKey } from '@/core/indexes/columns';
import { resolveColumn } from '@/core/model/columns';
import type { RowId } from '@/core/model/types';
import { ListTree } from 'lucide-react';

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
  const row = useMemo(
    () =>
      surveyRowId ? data.survey.rows.find((candidate) => candidate.id === surveyRowId) : undefined,
    [data.survey.rows, surveyRowId],
  );
  const nameKey = findColumnKey(data.survey, 'name') ?? 'name';
  const labels = data.survey.columns.filter((column) => resolveColumn(column).base === 'label');
  const labelKey = labels.find((column) => !resolveColumn(column).language) ?? labels[0] ?? nameKey;
  const name = row?.cells[nameKey] ?? '';
  const label = row?.cells[labelKey] ?? '';

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
        <code className="bg-muted rounded px-1 font-mono" data-testid="drawer-list-name">
          {listName}
        </code>
        <span className="ml-auto">rename arrives in Stage 5</span>
      </div>
    </div>
  );
}
