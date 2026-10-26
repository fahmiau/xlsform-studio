/**
 * Draft diffing for Build Mode staging (Task 6.7, AD-11).
 *
 * Pure `(base, draft) => diff`; the grid projects the diff and the staging bar
 * renders the summary. Row ids are internal, stable identities, so an edited
 * row keeps its tint even after reordering.
 */
import { parseType } from '../model/parseType';
import type {
  ColumnKey,
  ManagedSheetName,
  Row,
  RowId,
  SheetData,
  WorkbookData,
} from '../model/types';

export type RowChangeKind = 'inserted' | 'modified' | 'deleted';

export interface SheetDiff {
  rows: Map<RowId, RowChangeKind>;
  /** `rowId\u0000column` for changed cells in surviving rows. */
  cells: Set<string>;
}

export interface DiffSummary {
  total: number;
  inserted: number;
  modified: number;
  deleted: number;
  modifiedCells: number;
  groupsCreated: number;
  choiceListsAdded: number;
  /** Human line for the staging bar, e.g. `8 changes (1 group created)`. */
  text: string;
}

export interface WorkbookDiff {
  survey: SheetDiff;
  choices: SheetDiff;
  settings: SheetDiff;
  summary: DiffSummary;
}

export function cellChangeKey(rowId: RowId, column: ColumnKey): string {
  return `${rowId}\u0000${column}`;
}

function cellsDiffer(a: Row['cells'], b: Row['cells']): ColumnKey[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: ColumnKey[] = [];
  for (const key of [...keys].sort()) {
    if ((a[key] ?? '') !== (b[key] ?? '')) changed.push(key);
  }
  return changed;
}

function metaDiffers(a: Row | undefined, b: Row | undefined): boolean {
  return Boolean(a?.meta?.nameLocked) !== Boolean(b?.meta?.nameLocked);
}

function sheetDiff(base: SheetData, draft: SheetData): SheetDiff {
  const rows = new Map<RowId, RowChangeKind>();
  const cells = new Set<string>();
  const baseById = new Map(base.rows.map((row) => [row.id, row]));
  const draftById = new Map(draft.rows.map((row) => [row.id, row]));

  for (const row of draft.rows) {
    const before = baseById.get(row.id);
    if (!before) {
      rows.set(row.id, 'inserted');
      continue;
    }
    const changed = cellsDiffer(before.cells, row.cells);
    if (changed.length > 0 || metaDiffers(before, row)) {
      rows.set(row.id, 'modified');
      for (const column of changed) cells.add(cellChangeKey(row.id, column));
    }
  }
  for (const row of base.rows) {
    if (!draftById.has(row.id)) rows.set(row.id, 'deleted');
  }
  return { rows, cells };
}

function listNames(sheet: SheetData): Set<string> {
  const key = sheet.columns.find((column) => column.trim().toLowerCase() === 'list_name');
  if (!key) return new Set();
  return new Set(sheet.rows.map((row) => (row.cells[key] ?? '').trim()).filter(Boolean));
}

function groupsCreated(base: SheetData, draft: SheetData): number {
  const before = new Set(base.rows.map((row) => row.id));
  const typeKey = draft.columns.find((column) => column.trim().toLowerCase() === 'type') ?? 'type';
  return draft.rows.filter((row) => {
    if (before.has(row.id)) return false;
    const parsed = parseType(row.cells[typeKey] ?? '');
    return parsed.base === 'begin_group' || parsed.base === 'begin_repeat';
  }).length;
}

function summaryFor(
  survey: SheetDiff,
  choices: SheetDiff,
  groups: number,
  listsAdded: number,
): DiffSummary {
  const counts = { inserted: 0, modified: 0, deleted: 0 };
  for (const kind of [...survey.rows.values(), ...choices.rows.values()]) {
    counts[kind] += 1;
  }
  const total = counts.inserted + counts.modified + counts.deleted;
  const parts: string[] = [];
  if (groups > 0) parts.push(`${groups} group${groups === 1 ? '' : 's'} created`);
  if (listsAdded > 0) parts.push(`${listsAdded} choice list${listsAdded === 1 ? '' : 's'} added`);
  if (counts.inserted > 0) parts.push(`${counts.inserted} inserted`);
  if (counts.modified > 0) parts.push(`${counts.modified} modified`);
  if (counts.deleted > 0) parts.push(`${counts.deleted} deleted`);
  const text = `${total} change${total === 1 ? '' : 's'}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
  return {
    total,
    inserted: counts.inserted,
    modified: counts.modified,
    deleted: counts.deleted,
    modifiedCells: survey.cells.size + choices.cells.size,
    groupsCreated: groups,
    choiceListsAdded: listsAdded,
    text,
  };
}

export function diffWorkbooks(base: WorkbookData, draft: WorkbookData): WorkbookDiff {
  const survey = sheetDiff(base.survey, draft.survey);
  const choices = sheetDiff(base.choices, draft.choices);
  const settings = sheetDiff(base.settings, draft.settings);
  const created = groupsCreated(base.survey, draft.survey);
  const baseLists = listNames(base.choices);
  const added = [...listNames(draft.choices)].filter((name) => !baseLists.has(name)).length;
  return {
    survey,
    choices,
    settings,
    summary: summaryFor(survey, choices, created, added),
  };
}

export function sheetDiffFor(diff: WorkbookDiff, sheet: ManagedSheetName): SheetDiff {
  return diff[sheet];
}

export function rowChange(diff: WorkbookDiff, sheet: ManagedSheetName, rowId: RowId) {
  return diff[sheet].rows.get(rowId);
}

export function isCellModified(
  diff: WorkbookDiff,
  sheet: ManagedSheetName,
  rowId: RowId,
  column: ColumnKey,
): boolean {
  return diff[sheet].cells.has(cellChangeKey(rowId, column));
}
