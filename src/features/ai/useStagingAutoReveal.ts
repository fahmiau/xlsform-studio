/**
 * Auto-reveal staged rows inside collapsed groups (Task 6.7).
 * Deleted rows are looked up in the base tree, everything else in the draft.
 */
import { useEffect } from 'react';

import { buildGroupTree } from '@/core/indexes/groupTree';
import type { RowId, SheetData } from '@/core/model/types';
import { useDerivedStore } from '@/state/derivedStore';
import { useStagingStore } from '@/state/stagingStore';
import { useUiStore } from '@/state/uiStore';

function ancestorGroups(sheet: SheetData, rowId: RowId, groups: ReturnType<typeof buildGroupTree>) {
  const index = sheet.rows.findIndex((row) => row.id === rowId);
  if (index < 0) return [];
  return groups.groups
    .filter((group) => {
      const end = group.endRowIndex < 0 ? Number.POSITIVE_INFINITY : group.endRowIndex;
      return index >= group.startRowIndex && index <= end;
    })
    .map((group) => group.id);
}

export function useStagingAutoReveal(): void {
  const base = useStagingStore((state) => state.base);
  const draft = useStagingStore((state) => state.draft);
  const diff = useStagingStore((state) => state.diff);

  useEffect(() => {
    if (!base || !draft || !diff) return;
    const draftGroups = useDerivedStore.getState().indexes.groups;
    const baseGroups = buildGroupTree(base.survey);
    const reveal = new Set<RowId>();

    for (const [rowId, kind] of diff.survey.rows) {
      const groups = kind === 'deleted' ? baseGroups : draftGroups;
      const sheet = kind === 'deleted' ? base.survey : draft.survey;
      for (const id of ancestorGroups(sheet, rowId, groups)) reveal.add(id);
    }

    if (reveal.size > 0) useUiStore.getState().expandGroups([...reveal]);
  }, [base, diff, draft]);
}
