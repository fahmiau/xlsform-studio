/** Resolves the list bound to the active survey row (Task 3.4). */
import { useMemo } from 'react';

import { findColumnKey } from '@/core/indexes/columns';
import { primaryLabelColumn } from '@/core/languages/discover';
import { resolveColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import type { ColumnKey, Row, RowId } from '@/core/model/types';
import { detectListMode, modeFromStyle, type ListMode } from '@/core/slug/slugify';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export interface BoundList {
  surveyRowId: RowId | null;
  listName: string | null;
  rows: Row[];
  /** Real sheet indexes for the filtered rows. */
  rowIndexes: number[];
  mode: ListMode;
  labelKey?: ColumnKey;
  nameKey: ColumnKey;
  columns: ColumnKey[];
}

export function useBoundList(): BoundList {
  const data = useWorkbookStore((state) => state.data);
  const activeCell = useUiStore((state) => state.activeCell);
  const activeSurveyRowId = useUiStore((state) => state.activeCells.survey?.rowId ?? null);
  const drawer = useUiStore((state) => state.choiceDrawer);
  const modes = useUiStore((state) => state.choiceModes);
  const defaultSlugMode = usePrefsStore((state) => state.defaultSlugMode);

  return useMemo(() => {
    const surveyRowId =
      drawer.rowId ?? (activeCell?.sheet === 'survey' ? activeCell.rowId : activeSurveyRowId);
    const survey = data.survey;
    const typeKey = findColumnKey(survey, 'type') ?? 'type';
    const surveyRow = surveyRowId ? survey.rows.find((row) => row.id === surveyRowId) : undefined;
    const parsed = parseType(surveyRow?.cells[typeKey] ?? '');
    const listName = parsed.listName ?? null;

    const choices = data.choices;
    const listKey = findColumnKey(choices, 'list_name') ?? 'list_name';
    const nameKey = findColumnKey(choices, 'name') ?? 'name';
    const labelKey = primaryLabelColumn(choices, data);

    const rows: Row[] = [];
    const rowIndexes: number[] = [];
    if (listName) {
      choices.rows.forEach((row, index) => {
        if ((row.cells[listKey] ?? '').trim() !== listName) return;
        rows.push(row);
        rowIndexes.push(index);
      });
    }

    const inferred = detectListMode(
      rows.map((row) => row.cells[nameKey] ?? ''),
      modeFromStyle(defaultSlugMode),
    );
    const mode = listName ? (modes[listName] ?? inferred) : inferred;

    const hidden = new Set<ColumnKey>([listKey, nameKey]);
    if (labelKey) hidden.add(labelKey);
    const columns: ColumnKey[] = [];
    if (labelKey) columns.push(labelKey);
    columns.push(nameKey);
    for (const column of choices.columns) {
      if (hidden.has(column)) continue;
      // Other localizations are managed in Stage 5, not in the drawer.
      if (resolveColumn(column).base === 'label') continue;
      columns.push(column);
    }

    return {
      surveyRowId: surveyRow?.id ?? null,
      listName,
      rows,
      rowIndexes,
      mode,
      labelKey,
      nameKey,
      columns,
    };
  }, [activeCell, activeSurveyRowId, data, defaultSlugMode, drawer.rowId, modes]);
}
