/**
 * Choice-list operations (Tasks 3.3–3.6). Pure `(data, args) => data` functions
 * so the drawer, grid, and AI staging all share one implementation (AD-1).
 */
import { produce } from 'immer';

import { buildGroupTree } from '../indexes/groupTree';
import { columnKey } from '../indexes/columns';
import { primaryLabelColumn } from '../languages/discover';
import { resolveColumn } from '../model/columns';
import { newRowId } from '../model/factory';
import { formatType, parseType } from '../model/parseType';
import type { ColumnKey, Row, RowId, WorkbookData } from '../model/types';
import {
  autoChoiceName,
  detectListMode,
  slugify,
  uniqueName,
  type ListMode,
} from '../slug/slugify';
import { setCells, type CellEdit } from './cells';
import { addColumn } from './columns';
import { insertRows } from './rows';

export const SELECT_BASES: ReadonlySet<string> = new Set(['select_one', 'select_multiple', 'rank']);

const SELECT_LIST_BASES: ReadonlySet<string> = new Set([
  'select_one',
  'select_multiple',
  'rank',
  'select_one_from_file',
  'select_multiple_from_file',
]);

export const DEFAULT_LIST_NAME_PATTERN = '{name}';

function listNameKey(data: WorkbookData): ColumnKey {
  return columnKey(data.choices, 'list_name');
}

function nameColumn(data: WorkbookData): ColumnKey {
  return columnKey(data.choices, 'name');
}

function primaryLabelKey(data: WorkbookData): ColumnKey | undefined {
  return primaryLabelColumn(data.choices, data);
}

/** Names a new list must not collide with: both choice rows and survey types. */
export function existingListNames(data: WorkbookData, excludeRowId?: RowId): Set<string> {
  const names = new Set<string>();
  const listKey = listNameKey(data);
  for (const row of data.choices.rows) {
    const name = (row.cells[listKey] ?? '').trim();
    if (name) names.add(name);
  }
  const typeKey = columnKey(data.survey, 'type');
  for (const row of data.survey.rows) {
    if (row.id === excludeRowId) continue;
    const { listName } = parseType(row.cells[typeKey] ?? '');
    if (listName) names.add(listName);
  }
  return names;
}

/** Apply the configurable `{name}` pattern and slug the result. */
export function buildListName(
  name: string,
  pattern = DEFAULT_LIST_NAME_PATTERN,
  maxLength?: number,
): string {
  const rendered = pattern.includes('{name}')
    ? pattern.replaceAll('{name}', name)
    : `${name}${pattern}`;
  return slugify(rendered, maxLength === undefined ? {} : { maxLength });
}

/** A collision-free list name for a question (Task 3.3). */
export function suggestListName(
  data: WorkbookData,
  surveyRowId: RowId | undefined,
  questionName: string,
  pattern = DEFAULT_LIST_NAME_PATTERN,
  maxLength?: number,
): string {
  const base = buildListName(questionName || 'list', pattern, maxLength);
  const used = existingListNames(data, surveyRowId);
  return maxLength === undefined ? uniqueName(base, used) : uniqueName(base, used, maxLength);
}

function rowIndexById(rows: readonly Row[], rowId: RowId): number {
  return rows.findIndex((row) => row.id === rowId);
}

function listRows(choicesRows: readonly Row[], listNameValue: string, listKey: ColumnKey): Row[] {
  return choicesRows.filter((row) => (row.cells[listKey] ?? '').trim() === listNameValue);
}

function usedNames(rows: readonly Row[], nameKeyValue: ColumnKey): Set<string> {
  return new Set(
    rows.map((row) => (row.cells[nameKeyValue] ?? '').trim()).filter((name) => name.length > 0),
  );
}

/**
 * Set a survey `type` cell (Task 3.3). Selects without a list get one from the
 * question name, an empty question name adopts the list name, and begin/end
 * pairs stay consistent (Task 3.8). One call = one store `apply`.
 */
export function applyTypeChange(
  data: WorkbookData,
  surveyRowId: RowId,
  rawType: string,
  options: { pattern?: string; maxLength?: number } = {},
): WorkbookData {
  const index = rowIndexById(data.survey.rows, surveyRowId);
  if (index < 0) return data;
  const typeKey = columnKey(data.survey, 'type');
  const nameKey = columnKey(data.survey, 'name');
  const row = data.survey.rows[index];
  if (!row) return data;

  const parsed = parseType(rawType);
  const oldParsed = parseType(row.cells[typeKey] ?? '');
  const questionName = (row.cells[nameKey] ?? '').trim();
  let nextType = formatType(parsed);
  let nextName = questionName;

  if (SELECT_LIST_BASES.has(parsed.base) && !parsed.listName && questionName) {
    const listName = suggestListName(
      data,
      surveyRowId,
      questionName,
      options.pattern,
      options.maxLength,
    );
    nextType = formatType({ ...parsed, listName });
  }

  const effective = parseType(nextType);
  if (SELECT_LIST_BASES.has(effective.base) && effective.listName && !questionName) {
    nextName = effective.listName;
  }

  const source = data.survey.columns.includes(nameKey) ? data : addColumn(data, 'survey', nameKey);
  let next = setCells(source, 'survey', [
    { rowId: surveyRowId, column: typeKey, value: nextType },
    ...(nextName !== questionName
      ? [{ rowId: surveyRowId, column: nameKey, value: nextName }]
      : []),
  ]);

  // Pair consistency: begin_group ↔ begin_repeat updates the existing end row.
  const before = buildGroupTree(data.survey);
  const matchingEndId = before.matchingEnd.get(surveyRowId);
  if (matchingEndId) {
    const endRowIndex = rowIndexById(next.survey.rows, matchingEndId);
    const endRow = endRowIndex >= 0 ? next.survey.rows[endRowIndex] : undefined;
    if (endRow && parsed.base === 'begin_group' && oldParsed.base === 'begin_repeat') {
      next = setCells(next, 'survey', [{ rowId: endRow.id, column: typeKey, value: 'end_group' }]);
    } else if (endRow && parsed.base === 'begin_repeat' && oldParsed.base === 'begin_group') {
      next = setCells(next, 'survey', [{ rowId: endRow.id, column: typeKey, value: 'end_repeat' }]);
    }
  }

  // Auto-close: a new begin row without an end gets one directly below.
  if (parsed.base === 'begin_group' || parsed.base === 'begin_repeat') {
    const tree = buildGroupTree(next.survey);
    if (!tree.matchingEnd.has(surveyRowId)) {
      const at = rowIndexById(next.survey.rows, surveyRowId) + 1;
      next = insertRows(next, 'survey', at, [
        { cells: { [typeKey]: parsed.base === 'begin_group' ? 'end_group' : 'end_repeat' } },
      ]);
    }
  }

  return next;
}

export interface ChoiceEditOptions {
  /** Drawer mode; defaults to the list's detected convention. */
  mode?: ListMode;
  /** Per-list session overrides (`uiStore.choiceModes`). */
  listModes?: Readonly<Record<string, ListMode>>;
  /** Preferences default, used only when a list has no names yet. */
  fallbackMode?: ListMode;
  /** Slug length cap from Preferences (defaults to 32). */
  maxLength?: number;
}

/**
 * Resolve the naming mode for one list: explicit drawer mode, then the user's
 * session override, then the names already in the list (with the Preferences
 * default standing in for an empty list).
 */
function modeFor(
  rows: readonly Row[],
  listName: string,
  nameKeyValue: ColumnKey,
  options: ChoiceEditOptions,
): ListMode {
  return (
    options.mode ??
    options.listModes?.[listName] ??
    detectListMode(
      rows.map((row) => row.cells[nameKeyValue] ?? ''),
      options.fallbackMode,
    )
  );
}

/** De-duplicate an auto name without re-slugifying camel/passthrough spellings. */
function uniqueChoiceName(
  name: string,
  used: ReadonlySet<string>,
  mode: ListMode,
  maxLength?: number,
): string {
  const preserve = mode.kind === 'camel' || mode.kind === 'passthrough';
  return uniqueName(name, used, maxLength, preserve ? { slug: false } : {});
}

/** Apply label/name/extra edits with auto-naming and manual locks (Task 3.4). */
export function applyChoiceEdits(
  data: WorkbookData,
  edits: readonly CellEdit[],
  options: ChoiceEditOptions = {},
): WorkbookData {
  if (edits.length === 0) return data;
  for (const edit of edits) {
    if (!data.choices.columns.includes(edit.column)) {
      throw new Error(`Column "${edit.column}" does not exist in the choices sheet.`);
    }
  }
  const listKey = listNameKey(data);
  const nameKey = nameColumn(data);
  const labelKey = primaryLabelKey(data);

  return produce(data, (draft) => {
    const rows = draft.choices.rows;
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const edit of edits) {
      const row = byId.get(edit.rowId);
      if (!row) continue;
      const base = resolveColumn(edit.column).base;
      if (edit.value === '') delete row.cells[edit.column];
      else row.cells[edit.column] = edit.value;

      if (base === 'name') {
        if (edit.value.trim() === '') {
          if (row.meta) delete row.meta.nameLocked;
        } else {
          row.meta = { ...row.meta, nameLocked: true };
        }
        continue;
      }

      if (base !== 'label' || !labelKey) continue;
      if (row.meta?.nameLocked) continue;

      const listName = (row.cells[listKey] ?? '').trim();
      const siblings = listName ? listRows(rows, listName, listKey) : [];
      const mode = modeFor(siblings, listName, nameKey, options);
      const position = siblings.length > 0 ? siblings.indexOf(row) + 1 : 1;
      const expected = autoChoiceName(
        row.cells[labelKey] ?? '',
        mode,
        position,
        position,
        options.maxLength,
      );
      const name = uniqueChoiceName(
        expected,
        usedNames(
          siblings.filter((r) => r.id !== row.id),
          nameKey,
        ),
        mode,
        options.maxLength,
      );
      row.cells[nameKey] = name;
    }
  });
}

/** Insert one choice after the last row of its list (Task 3.4). */
export function insertChoiceRow(
  data: WorkbookData,
  listNameValue: string,
  cells: Record<ColumnKey, string> = {},
  options: ChoiceEditOptions = {},
): { data: WorkbookData; rowId: RowId } {
  const listKey = listNameKey(data);
  const nameKeyValue = nameColumn(data);
  const labelKey = primaryLabelKey(data);
  const rowId = newRowId();

  const next = produce(data, (draft) => {
    const rows = draft.choices.rows;
    if (!draft.choices.columns.includes(listKey)) draft.choices.columns.push(listKey);
    let at = rows.length;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if ((rows[index]?.cells[listKey] ?? '').trim() === listNameValue) {
        at = index + 1;
        break;
      }
    }
    const existing = listRows(rows, listNameValue, listKey);
    const mode = modeFor(existing, listNameValue, nameKeyValue, options);
    const position = existing.length + 1;
    const rowCells: Record<ColumnKey, string> = { ...cells, [listKey]: listNameValue };
    if (labelKey && !(rowCells[nameKeyValue] ?? '').trim()) {
      const made = autoChoiceName(
        rowCells[labelKey] ?? '',
        mode,
        position,
        position,
        options.maxLength,
      );
      rowCells[nameKeyValue] = uniqueChoiceName(
        made,
        usedNames(existing, nameKeyValue),
        mode,
        options.maxLength,
      );
    }
    rows.splice(at, 0, { id: rowId, cells: rowCells });
  });

  return { data: next, rowId };
}

export interface BulkInsertResult {
  data: WorkbookData;
  rowIds: RowId[];
}

/**
 * Paste N rows into a list in one transaction (Task 3.5). The matrix maps onto
 * the drawer's visible columns in order; a pasted name locks its row.
 */
export function bulkInsertChoices(
  data: WorkbookData,
  listNameValue: string,
  matrix: readonly (readonly string[])[],
  keys: readonly ColumnKey[],
  options: ChoiceEditOptions = {},
): BulkInsertResult {
  const cleaned = matrix.filter((row) => row.some((value) => value !== ''));
  if (cleaned.length === 0) return { data, rowIds: [] };
  const listKey = listNameKey(data);
  const nameKeyValue = nameColumn(data);
  const labelKey = primaryLabelKey(data);
  const rowIds: RowId[] = [];

  const next = produce(data, (draft) => {
    const rows = draft.choices.rows;
    if (!draft.choices.columns.includes(listKey)) draft.choices.columns.push(listKey);
    let at = rows.length;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if ((rows[index]?.cells[listKey] ?? '').trim() === listNameValue) {
        at = index + 1;
        break;
      }
    }
    const existing = listRows(rows, listNameValue, listKey);
    const mode = modeFor(existing, listNameValue, nameKeyValue, options);
    const used = usedNames(existing, nameKeyValue);
    let position = existing.length;

    const inserted = cleaned.map((values): Row => {
      position += 1;
      const cells: Record<ColumnKey, string> = {};
      keys.forEach((key, column) => {
        if (key === listKey) return;
        const value = values[column];
        if (value !== undefined && value !== '') cells[key] = value;
      });
      cells[listKey] = listNameValue;
      const pastedName = (cells[nameKeyValue] ?? '').trim();
      const label = labelKey ? (cells[labelKey] ?? '') : '';
      let locked = false;
      if (pastedName) {
        locked = true;
        used.add(pastedName);
      } else if (nameKeyValue) {
        const expected = autoChoiceName(label, mode, position, position, options.maxLength);
        const name = uniqueChoiceName(expected, used, mode, options.maxLength);
        used.add(name);
        cells[nameKeyValue] = name;
      }
      const row: Row = { id: newRowId(), cells };
      if (locked) row.meta = { nameLocked: true };
      rowIds.push(row.id);
      return row;
    });

    rows.splice(at, 0, ...inserted);
  });

  return { data: next, rowIds };
}

/**
 * Regenerate names for every unlocked row in display order (Task 3.5). Locked
 * rows are reserved first so new names never collide with them.
 */
export function renumberList(
  data: WorkbookData,
  listNameValue: string,
  mode: ListMode,
  maxLength?: number,
): WorkbookData {
  const listKey = listNameKey(data);
  const nameKeyValue = nameColumn(data);
  const labelKey = primaryLabelKey(data);

  return produce(data, (draft) => {
    const rows = listRows(draft.choices.rows, listNameValue, listKey);
    if (rows.length === 0) return;
    const used = new Set<string>();
    for (const row of rows) {
      if (row.meta?.nameLocked) used.add((row.cells[nameKeyValue] ?? '').trim());
    }

    rows.forEach((row, index) => {
      if (row.meta?.nameLocked) return;
      const label = labelKey ? (row.cells[labelKey] ?? '') : '';
      const expected = autoChoiceName(label, mode, index + 1, index + 1, maxLength);
      // Numeric/prefix names skip positions until the next free number; every
      // other mode de-duplicates the generated name without re-slugifying it.
      if (mode.kind === 'numeric' || mode.kind === 'prefix') {
        let name = expected;
        for (let attempt = index + 1; used.has(name) && attempt < index + 10_000; attempt += 1) {
          name = autoChoiceName(label, mode, attempt + 1, attempt + 1, maxLength);
        }
        row.cells[nameKeyValue] = name;
        used.add(name);
        return;
      }
      const name = uniqueChoiceName(expected, used, mode, maxLength);
      row.cells[nameKeyValue] = name;
      used.add(name);
    });
  });
}

export interface ForkListResult {
  data: WorkbookData;
  newListName: string;
}

/** Clone a shared list for one question and retarget only that row (Task 3.6). */
export function forkList(
  data: WorkbookData,
  sourceListName: string,
  surveyRowId: RowId,
  options: { pattern?: string; maxLength?: number } = {},
): ForkListResult {
  const surveyIndex = rowIndexById(data.survey.rows, surveyRowId);
  if (surveyIndex < 0) return { data, newListName: sourceListName };
  const typeKey = columnKey(data.survey, 'type');
  const nameKeyValue = columnKey(data.survey, 'name');
  const row = data.survey.rows[surveyIndex];
  if (!row) return { data, newListName: sourceListName };

  const parsed = parseType(row.cells[typeKey] ?? '');
  if (!SELECT_LIST_BASES.has(parsed.base)) return { data, newListName: sourceListName };
  const questionName = (row.cells[nameKeyValue] ?? '').trim() || sourceListName;
  const newListName = suggestListName(
    data,
    surveyRowId,
    questionName,
    options.pattern,
    options.maxLength,
  );
  if (newListName === sourceListName) return { data, newListName: sourceListName };

  const listKey = listNameKey(data);
  const sourceRows = listRows(data.choices.rows, sourceListName, listKey);

  const next = produce(data, (draft) => {
    let at = draft.choices.rows.length;
    for (let index = draft.choices.rows.length - 1; index >= 0; index -= 1) {
      if ((draft.choices.rows[index]?.cells[listKey] ?? '').trim() === sourceListName) {
        at = index + 1;
        break;
      }
    }
    const clones: Row[] = sourceRows.map((source) => {
      const cells: Record<ColumnKey, string> = { ...source.cells, [listKey]: newListName };
      const clone: Row = { id: newRowId(), cells };
      if (source.meta) clone.meta = { ...source.meta };
      return clone;
    });
    draft.choices.rows.splice(at, 0, ...clones);

    const surveyRow = draft.survey.rows.find((candidate) => candidate.id === surveyRowId);
    if (surveyRow) {
      surveyRow.cells[typeKey] = formatType({ ...parsed, listName: newListName });
    }
  });

  return { data: next, newListName };
}

export interface AddFilterColumnResult {
  data: WorkbookData;
  added: boolean;
  scaffolded: boolean;
}

/** Add a cascading-filter column and optionally scaffold `choice_filter` (3.6). */
export function addFilterColumn(
  data: WorkbookData,
  column: string,
  options: { surveyRowId?: RowId; parentName?: string; append?: boolean } = {},
): AddFilterColumnResult {
  const trimmed = column.trim();
  if (!trimmed) return { data, added: false, scaffolded: false };
  const exists = data.choices.columns.includes(trimmed);

  let scaffolded = false;
  const next = produce(data, (draft) => {
    if (!exists) draft.choices.columns.push(trimmed);
    if (!options.surveyRowId || !options.parentName) return;
    const row = draft.survey.rows.find((candidate) => candidate.id === options.surveyRowId);
    if (!row) return;
    const filterKey = columnKey(draft.survey, 'choice_filter');
    if (!draft.survey.columns.includes(filterKey)) draft.survey.columns.push(filterKey);
    const expression = `${trimmed} = \${${options.parentName}}`;
    const existing = (row.cells[filterKey] ?? '').trim();
    if (!existing) {
      row.cells[filterKey] = expression;
      scaffolded = true;
    } else if (options.append) {
      row.cells[filterKey] = `${existing} and ${expression}`;
      scaffolded = true;
    }
  });

  return { data: next, added: !exists, scaffolded };
}

/** Question names whose formulas reference the questions bound to a list. */
export function listReferencedInFormulas(data: WorkbookData, listNameValue: string): string[] {
  const typeKey = columnKey(data.survey, 'type');
  const nameKeyValue = columnKey(data.survey, 'name');
  const names = data.survey.rows
    .filter((row) => parseType(row.cells[typeKey] ?? '').listName === listNameValue)
    .map((row) => (row.cells[nameKeyValue] ?? '').trim())
    .filter(Boolean);
  if (names.length === 0) return [];

  const referenced: string[] = [];
  for (const name of names) {
    const pattern = new RegExp(`\\$\\{\\s*${escapeRegExp(name)}\\s*\\}`);
    const hit = data.survey.rows.some((row) =>
      Object.values(row.cells).some((value) => pattern.test(value)),
    );
    if (hit) referenced.push(name);
  }
  return referenced;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All list names in document order, without duplicates. */
export function choiceListNames(data: WorkbookData): string[] {
  const listKey = listNameKey(data);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of data.choices.rows) {
    const name = (row.cells[listKey] ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Unlock a choice name and regenerate it from its label (Task 3.4). */
export function unlockChoiceName(
  data: WorkbookData,
  rowId: RowId,
  options: ChoiceEditOptions = {},
): WorkbookData {
  const listKey = listNameKey(data);
  const nameKeyValue = nameColumn(data);
  const labelKey = primaryLabelKey(data);
  return produce(data, (draft) => {
    const row = draft.choices.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    if (row.meta) delete row.meta.nameLocked;
    if (!labelKey) return;
    const listNameValue = (row.cells[listKey] ?? '').trim();
    const siblings = listRows(draft.choices.rows, listNameValue, listKey);
    const mode = modeFor(siblings, listNameValue, nameKeyValue, options);
    const position = Math.max(1, siblings.indexOf(row) + 1);
    const expected = autoChoiceName(
      row.cells[labelKey] ?? '',
      mode,
      position,
      position,
      options.maxLength,
    );
    row.cells[nameKeyValue] = uniqueChoiceName(
      expected,
      usedNames(
        siblings.filter((candidate) => candidate.id !== rowId),
        nameKeyValue,
      ),
      mode,
      options.maxLength,
    );
  });
}

/** Survey rows bound to a list, with their label for the shared banner. */
export function listUsageDetails(
  data: WorkbookData,
  listNameValue: string,
): Array<{ rowId: RowId; name: string; label: string }> {
  const typeKey = columnKey(data.survey, 'type');
  const nameKeyValue = columnKey(data.survey, 'name');
  const labelKey = primaryLabelColumn(data.survey, data) ?? nameKeyValue;
  return data.survey.rows
    .filter((row) => parseType(row.cells[typeKey] ?? '').listName === listNameValue)
    .map((row) => ({
      rowId: row.id,
      name: (row.cells[nameKeyValue] ?? '').trim(),
      label: (row.cells[labelKey] ?? '').trim(),
    }));
}
