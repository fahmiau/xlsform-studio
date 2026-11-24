/**
 * Group/repeat structure operations (Task 3.8). Balance rules are pure so both
 * shortcuts and the context menu reject the same selections.
 */
import { produce } from 'immer';

import { buildGroupTree, type GroupNode } from '../indexes/groupTree';
import { columnKey, findColumnKey } from '../indexes/columns';
import { newRowId } from '../model/factory';
import { parseType } from '../model/parseType';
import type { Row, RowId, SheetData, WorkbookData } from '../model/types';
import { uniqueName } from '../slug/slugify';

export interface BalanceResult {
  ok: boolean;
  reason?: string;
}

export interface WrapResult {
  data: WorkbookData;
  rowId?: RowId;
  reason?: string;
}

function surveyNames(data: WorkbookData): Set<string> {
  const nameKey = columnKey(data.survey, 'name');
  return new Set(
    data.survey.rows
      .map((row) => (row.cells[nameKey] ?? '').trim())
      .filter((name) => name.length > 0),
  );
}

/** A collision-free name for a new group/repeat. */
export function suggestGroupName(data: WorkbookData, kind: 'group' | 'repeat'): string {
  const base = kind === 'repeat' ? 'repeat_1' : 'group_1';
  return uniqueName(base, surveyNames(data));
}

function intersects(start: number, end: number, group: GroupNode): boolean {
  if (group.endRowIndex < 0) return start <= group.startRowIndex && group.startRowIndex <= end;
  return start <= group.endRowIndex && end >= group.startRowIndex;
}

/**
 * A selection can be wrapped only when it does not cut through a group: every
 * group it touches must be fully inside it.
 */
export function checkSelectionBalance(
  sheet: SheetData,
  startIndex: number,
  endIndex: number,
): BalanceResult {
  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(sheet.rows.length - 1, Math.max(startIndex, endIndex));
  if (start > end || sheet.rows.length === 0) {
    return { ok: false, reason: 'Select at least one row first.' };
  }

  const tree = buildGroupTree(sheet);
  const typeKey = columnKey(sheet, 'type');
  for (const group of tree.groups) {
    if (!intersects(start, end, group)) continue;
    if (group.endRowIndex < 0) {
      // Wrapping inside an unclosed group is fine; swallowing its header is not.
      if (group.startRowIndex >= start) {
        return {
          ok: false,
          reason: `The selection contains the unclosed group "${group.name || '(unnamed)'}". Add its end row first (XLS-003).`,
        };
      }
      continue;
    }
    const groupInside = group.startRowIndex >= start && group.endRowIndex <= end;
    const selectionInside = start >= group.startRowIndex && end <= group.endRowIndex;
    if (!groupInside && !selectionInside) {
      return {
        ok: false,
        reason: `The selection cuts through the group "${group.name || '(unnamed)'}". Select the whole block or a block inside it.`,
      };
    }
  }

  const orphanSet = new Set(tree.orphans);
  for (let index = start; index <= end; index += 1) {
    const row = sheet.rows[index];
    if (row && orphanSet.has(row.id)) {
      return {
        ok: false,
        reason: 'The selection contains an end row without an open group (XLS-003).',
      };
    }
  }

  // A selection that starts on an end row of an enclosing group already failed
  // the containment check above; this guards empty/structural-only edge cases.
  const first = parseType(sheet.rows[start]?.cells[typeKey] ?? '');
  if (first.base === 'end_group' || first.base === 'end_repeat') {
    return { ok: false, reason: 'A selection cannot start with an end row.' };
  }

  return { ok: true };
}

/**
 * Insert `begin_* … end_*` around a balanced selection. `options.name` is the
 * suggested name shown in edit mode; a free one is generated when omitted.
 */
export function wrapSelection(
  data: WorkbookData,
  startIndex: number,
  endIndex: number,
  kind: 'group' | 'repeat',
  options: { name?: string; label?: string } = {},
): WrapResult {
  const balance = checkSelectionBalance(data.survey, startIndex, endIndex);
  if (!balance.ok) return { data, reason: balance.reason };

  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(data.survey.rows.length - 1, Math.max(startIndex, endIndex));
  const nameKey = columnKey(data.survey, 'name');
  const typeKey = columnKey(data.survey, 'type');
  const name = options.name?.trim() || suggestGroupName(data, kind);
  const rowId = newRowId();

  const next = produce(data, (draft) => {
    if (kind === 'repeat' && !findColumnKey(draft.survey, 'repeat_count')) {
      draft.survey.columns.push('repeat_count');
    }
    const rows = draft.survey.rows;
    const begin: Row = {
      id: rowId,
      cells: {
        [typeKey]: `begin_${kind}`,
        [nameKey]: name,
        ...(options.label ? { label: options.label } : {}),
      },
    };
    const endRow: Row = { id: newRowId(), cells: { [typeKey]: `end_${kind}` } };
    rows.splice(end + 1, 0, endRow);
    rows.splice(start, 0, begin);
  });

  return { data: next, rowId };
}

/** Remove exactly the begin/end pair of a group, keeping its contents. */
export function unwrapGroup(data: WorkbookData, groupRowId: RowId): WorkbookData {
  const tree = buildGroupTree(data.survey);
  const group = tree.groups.find((candidate) => candidate.id === groupRowId);
  if (!group || group.endRowIndex < 0) return data;
  return produce(data, (draft) => {
    draft.survey.rows.splice(group.endRowIndex, 1);
    draft.survey.rows.splice(group.startRowIndex, 1);
  });
}

/** Delete a group header, its end row, and every row in between. */
export function deleteGroupWithContents(data: WorkbookData, groupRowId: RowId): WorkbookData {
  const tree = buildGroupTree(data.survey);
  const group = tree.groups.find((candidate) => candidate.id === groupRowId);
  if (!group) return data;
  const end = group.endRowIndex < 0 ? data.survey.rows.length - 1 : group.endRowIndex;
  return produce(data, (draft) => {
    draft.survey.rows.splice(group.startRowIndex, end - group.startRowIndex + 1);
  });
}

/** Innermost group containing a real row index, if any. */
export function groupContainingRow(
  groups: readonly GroupNode[],
  rowIndex: number,
): GroupNode | undefined {
  let found: GroupNode | undefined;
  for (const group of groups) {
    const end = group.endRowIndex < 0 ? Number.POSITIVE_INFINITY : group.endRowIndex;
    if (rowIndex >= group.startRowIndex && rowIndex <= end) {
      if (!found || group.depth > found.depth) found = group;
    }
  }
  return found;
}

/** Rows hidden by collapsing a group (all child rows, structural included). */
export function groupHiddenCount(group: GroupNode): number {
  if (group.endRowIndex < 0) return 0;
  return Math.max(0, group.endRowIndex - group.startRowIndex - 1);
}

/** Rows hidden by collapsing a group, excluding nested structural rows. */
export function groupHiddenQuestionCount(sheet: SheetData, group: GroupNode): number {
  if (group.endRowIndex < 0) return 0;
  const typeKey = columnKey(sheet, 'type');
  let count = 0;
  for (let index = group.startRowIndex + 1; index < group.endRowIndex; index += 1) {
    const base = parseType(sheet.rows[index]?.cells[typeKey] ?? '').base;
    if (
      base === 'begin_group' ||
      base === 'end_group' ||
      base === 'begin_repeat' ||
      base === 'end_repeat'
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}
