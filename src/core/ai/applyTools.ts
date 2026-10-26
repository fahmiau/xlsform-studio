/**
 * Build Mode tool application (Task 6.6, AD-1/AD-2).
 *
 * Every tool runs against a *draft* `WorkbookData` through the same pure ops
 * the UI uses. Nothing here touches a store, so Build Mode can stage a run and
 * Accept it as one undo entry later (AD-11).
 */
import { columnKey } from '../indexes/columns';
import { buildGroupTree } from '../indexes/groupTree';
import { discoverLanguages, findLanguage, primaryLabelColumn } from '../languages/discover';
import { addColumn } from '../ops/columns';
import { setCells } from '../ops/cells';
import { deleteRows, insertRows, type RowInsert } from '../ops/rows';
import { newRowId } from '../model/factory';
import { localizedHeader, resolveColumn } from '../model/columns';
import { parseType } from '../model/parseType';
import type { ColumnKey, ManagedSheetName, RowId, WorkbookData } from '../model/types';
import { renameVariable } from '../refactor/renameVariable';
import { slugify, uniqueName } from '../slug/slugify';
import { parseToolInput, type ToolName } from './tools';

export interface ToolResult {
  ok: boolean;
  summary: string;
  errors: string[];
}

export interface ApplyToolOutcome {
  data: WorkbookData;
  result: ToolResult;
}

export interface ApplyToolOptions {
  /** Deterministic id source for tests. */
  newId?: () => RowId;
}

const LABEL_BASES = ['label', 'hint', 'constraint_message'] as const;
type LabelBase = (typeof LABEL_BASES)[number];

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const LIST_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function fail(data: WorkbookData, errors: string[]): ApplyToolOutcome {
  return {
    data,
    result: { ok: false, summary: errors[0] ?? 'invalid tool call', errors },
  };
}

function succeed(data: WorkbookData, summary: string): ApplyToolOutcome {
  return { data, result: { ok: true, summary, errors: [] } };
}

function ensureColumn(
  data: WorkbookData,
  sheet: ManagedSheetName,
  column: ColumnKey,
): WorkbookData {
  return data[sheet].columns.includes(column) ? data : addColumn(data, sheet, column);
}

function availableLanguages(data: WorkbookData): string {
  return discoverLanguages(data)
    .map((language) => language.display)
    .join(', ');
}

function languageColumn(
  data: WorkbookData,
  sheet: ManagedSheetName,
  base: LabelBase,
  identifier: string,
): { column: ColumnKey; known: boolean } {
  const language = findLanguage(discoverLanguages(data), identifier);
  if (!language) return { column: '', known: false };
  const tag = language.code
    ? { name: language.name, code: language.code }
    : { name: language.name };
  const header = localizedHeader(base, tag);
  const existing = data[sheet].columns.find((candidate) => {
    const resolved = resolveColumn(candidate);
    if (resolved.base !== base || !resolved.language) return false;
    const sameName = resolved.language.name.toLowerCase() === language.name.toLowerCase();
    const sameCode =
      (resolved.language.code ?? '').toLowerCase() === (language.code ?? '').toLowerCase();
    return sameName && sameCode;
  });
  return { column: existing ?? header, known: true };
}

/**
 * Resolve a `label` / `hint` / `constraint_message` map to columns, adding the
 * localized columns it needs. `default` and `label` mean the default-language
 * column. Unknown languages are errors so the model can self-correct.
 */
function resolveLocalizedMap(
  data: WorkbookData,
  sheet: ManagedSheetName,
  base: LabelBase,
  values: Record<string, string> | undefined,
): { data: WorkbookData; cells: Record<ColumnKey, string>; errors: string[] } {
  const cells: Record<ColumnKey, string> = {};
  const errors: string[] = [];
  if (!values) return { data, cells, errors };
  let next = data;

  for (const [rawKey, value] of Object.entries(values)) {
    if (value === '') continue;
    const key = rawKey.trim();
    const normalized = key.toLowerCase();
    if (!key || normalized === 'default' || normalized === 'label' || normalized === base) {
      const defaultColumn =
        base === 'label'
          ? (primaryLabelColumn(next[sheet], next) ?? base)
          : (next[sheet].columns.find((column) => {
              const resolved = resolveColumn(column);
              return resolved.base === base && !resolved.language;
            }) ?? base);
      next = ensureColumn(next, sheet, defaultColumn);
      cells[defaultColumn] = value;
      continue;
    }

    const resolved = languageColumn(next, sheet, base, key);
    if (!resolved.known) {
      errors.push(`unknown language "${key}"; available: ${availableLanguages(next) || 'Default'}`);
      continue;
    }
    next = ensureColumn(next, sheet, resolved.column);
    cells[resolved.column] = value;
  }
  return { data: next, cells, errors };
}

function surveyNameColumn(data: WorkbookData): ColumnKey {
  return columnKey(data.survey, 'name');
}

function surveyTypeColumn(data: WorkbookData): ColumnKey {
  return columnKey(data.survey, 'type');
}

function surveyNames(data: WorkbookData): Set<string> {
  const key = surveyNameColumn(data);
  return new Set(
    data.survey.rows.map((row) => (row.cells[key] ?? '').trim()).filter((name) => name.length > 0),
  );
}

interface GroupBalance {
  ok: boolean;
  errors: string[];
}

/** Validate begin/end balance inside one insert batch (Task 6.6). */
export function checkBatchBalance(types: readonly string[]): GroupBalance {
  const stack: Array<'group' | 'repeat'> = [];
  const errors: string[] = [];
  types.forEach((type, index) => {
    const base = parseType(type).base;
    if (base === 'begin_group' || base === 'begin_repeat') {
      stack.push(base === 'begin_group' ? 'group' : 'repeat');
      return;
    }
    if (base !== 'end_group' && base !== 'end_repeat') return;
    const expected = base === 'end_group' ? 'group' : 'repeat';
    const top = stack[stack.length - 1];
    if (top !== expected) {
      errors.push(`row ${index}: ${base} does not match the open block`);
      return;
    }
    stack.pop();
  });
  if (stack.length > 0) {
    errors.push(
      `${stack.length} begin_${stack[stack.length - 1]} row(s) in the batch have no matching end row`,
    );
  }
  return { ok: errors.length === 0, errors };
}

interface InsertInput {
  afterRowIndex: number;
  rows: Array<{
    type: string;
    name?: string;
    label?: Record<string, string>;
    hint?: Record<string, string>;
    relevant?: string;
    constraint?: string;
    constraint_message?: Record<string, string>;
    calculation?: string;
    required?: string;
    appearance?: string;
    choice_filter?: string;
  }>;
}

function applyInsert(
  data: WorkbookData,
  input: InsertInput,
  options: ApplyToolOptions,
): ApplyToolOutcome {
  const balance = checkBatchBalance(input.rows.map((row) => row.type));
  if (!balance.ok) return fail(data, balance.errors);

  let next = ensureColumn(data, 'survey', surveyTypeColumn(data));
  next = ensureColumn(next, 'survey', surveyNameColumn(next));
  const typeKey = surveyTypeColumn(next);
  const nameKey = surveyNameColumn(next);
  const usedNames = surveyNames(next);
  const errors: string[] = [];
  const inserts: RowInsert[] = [];

  for (const [index, row] of input.rows.entries()) {
    const cells: Record<ColumnKey, string> = { [typeKey]: row.type.trim() };
    if (!row.type.trim()) errors.push(`row ${index}: type is empty`);

    const name = (row.name ?? '').trim();
    if (name) {
      if (!NAME_PATTERN.test(name)) {
        errors.push(
          `row ${index}: "${name}" is not a valid variable name (use letters, digits, _ . -; must not start with a digit)`,
        );
      } else if (usedNames.has(name)) {
        errors.push(
          `row ${index}: name "${name}" is already used; try "${uniqueName(name, usedNames)}"`,
        );
      } else {
        cells[nameKey] = name;
        usedNames.add(name);
      }
    }

    for (const base of LABEL_BASES) {
      const values = row[base];
      if (!values) continue;
      const resolved = resolveLocalizedMap(next, 'survey', base, values);
      next = resolved.data;
      errors.push(...resolved.errors.map((error) => `row ${index}: ${error}`));
      Object.assign(cells, resolved.cells);
    }

    for (const base of [
      'relevant',
      'constraint',
      'calculation',
      'required',
      'appearance',
      'choice_filter',
    ] as const) {
      const value = row[base];
      if (value === undefined || value === '') continue;
      const column = columnKey(next.survey, base);
      next = ensureColumn(next, 'survey', column);
      cells[column] = value;
    }

    inserts.push({ id: options.newId ? options.newId() : newRowId(), cells });
  }

  if (errors.length > 0) return fail(data, errors);

  const at = input.afterRowIndex < 0 ? 0 : input.afterRowIndex + 1;
  next = insertRows(next, 'survey', at, inserts);
  return succeed(
    next,
    `inserted ${inserts.length} survey row(s) at index ${Math.min(at, data.survey.rows.length)}`,
  );
}

function resolveTargetRow(data: WorkbookData, targetName: string) {
  const nameKey = surveyNameColumn(data);
  const trimmed = targetName.trim();
  const byName = data.survey.rows.find((row) => (row.cells[nameKey] ?? '').trim() === trimmed);
  if (byName) return byName;
  return data.survey.rows.find((row) => row.id === trimmed);
}

function resolveChangeColumn(
  data: WorkbookData,
  key: string,
): { data: WorkbookData; column?: ColumnKey; errors: string[] } {
  const existing =
    data.survey.columns.find((column) => column === key) ??
    data.survey.columns.find((column) => column.toLowerCase() === key.toLowerCase());
  if (existing) return { data, column: existing, errors: [] };

  if (key.includes('::')) {
    const [basePart, ...rest] = key.split('::');
    const base = (basePart ?? '').trim() as LabelBase;
    if (LABEL_BASES.includes(base)) {
      const resolved = resolveLocalizedMap(data, 'survey', base, { [rest.join('::')]: 'x' });
      return {
        data: resolved.data,
        ...(resolved.errors.length === 0 ? { column: Object.keys(resolved.cells)[0] } : {}),
        errors: resolved.errors,
      };
    }
  }

  const base = resolveColumn(key).base;
  if (base === 'custom') {
    return {
      data,
      errors: [
        `unknown survey column "${key}"; use one of: type, name, label, hint, relevant, constraint, constraint_message, calculation, required, appearance, choice_filter`,
      ],
    };
  }
  const column = columnKey(data.survey, base);
  return { data: ensureColumn(data, 'survey', column), column, errors: [] };
}

interface UpdateInput {
  updates: Array<{ targetName: string; changes: Record<string, string> }>;
}

function applyUpdate(
  data: WorkbookData,
  input: UpdateInput,
  _options: ApplyToolOptions,
): ApplyToolOutcome {
  let next = data;
  const errors: string[] = [];
  let updatedCells = 0;
  const touchedRows = new Set<RowId>();

  for (const update of input.updates) {
    const row = resolveTargetRow(next, update.targetName);
    if (!row) {
      errors.push(`row not found: "${update.targetName}"`);
      continue;
    }
    touchedRows.add(row.id);

    for (const [key, value] of Object.entries(update.changes)) {
      const currentRow = next.survey.rows.find((candidate) => candidate.id === row.id);
      if (!currentRow) {
        errors.push(`row disappeared while updating: "${update.targetName}"`);
        break;
      }

      const nameKey = surveyNameColumn(next);
      if (key.trim().toLowerCase() === 'name') {
        const oldName = (currentRow.cells[nameKey] ?? '').trim();
        const newName = value.trim();
        if (!NAME_PATTERN.test(newName)) {
          errors.push(`"${newName}" is not a valid variable name`);
          continue;
        }
        const clash = next.survey.rows.some(
          (candidate) =>
            candidate.id !== currentRow.id && (candidate.cells[nameKey] ?? '').trim() === newName,
        );
        if (clash) {
          errors.push(
            `name "${newName}" is already used; try "${uniqueName(newName, surveyNames(next))}"`,
          );
          continue;
        }
        if (oldName && oldName !== newName) {
          next = setCells(next, 'survey', [
            { rowId: currentRow.id, column: nameKey, value: newName },
          ]);
          next = renameVariable(next, oldName, newName).data;
        } else {
          next = setCells(next, 'survey', [
            { rowId: currentRow.id, column: nameKey, value: newName },
          ]);
        }
        updatedCells += 1;
        continue;
      }

      const resolved = resolveChangeColumn(next, key);
      next = resolved.data;
      if (!resolved.column) {
        errors.push(...resolved.errors.map((error) => `${update.targetName}: ${error}`));
        continue;
      }
      const column = resolved.column;
      next = setCells(next, 'survey', [{ rowId: row.id, column, value }]);
      updatedCells += 1;
    }
  }

  if (errors.length > 0) return fail(data, errors);
  return succeed(next, `updated ${updatedCells} cell(s) on ${touchedRows.size} row(s)`);
}

interface UpsertInput {
  list_name: string;
  choices: Array<{
    name?: string;
    label?: Record<string, string>;
    filters?: Record<string, string>;
  }>;
  mode: 'replace' | 'append';
}

function applyUpsert(
  data: WorkbookData,
  input: UpsertInput,
  options: ApplyToolOptions,
): ApplyToolOutcome {
  const listName = input.list_name.trim();
  if (!LIST_NAME_PATTERN.test(listName)) {
    return fail(data, [
      `invalid list_name "${listName}"; use letters, digits, _ . - and do not start with a digit`,
    ]);
  }

  let next = ensureColumn(data, 'choices', columnKey(data.choices, 'list_name'));
  next = ensureColumn(next, 'choices', columnKey(next.choices, 'name'));
  const listKey = columnKey(next.choices, 'list_name');
  const nameKey = columnKey(next.choices, 'name');

  const existingRows = next.choices.rows.filter(
    (row) => (row.cells[listKey] ?? '').trim() === listName,
  );
  const usedNames = new Set(
    existingRows.map((row) => (row.cells[nameKey] ?? '').trim()).filter(Boolean),
  );
  if (input.mode === 'replace') usedNames.clear();

  const errors: string[] = [];
  const inserts: RowInsert[] = [];
  const firstExistingIndex = existingRows.length
    ? next.choices.rows.findIndex((row) => row.id === existingRows[0]?.id)
    : -1;

  input.choices.forEach((choice, index) => {
    const cells: Record<ColumnKey, string> = { [listKey]: listName };
    const label = choice.label ?? {};
    let provided = (choice.name ?? '').trim();
    if (!provided) {
      const firstLabel = Object.values(label)[0] ?? '';
      provided = slugify(firstLabel || `choice_${index + 1}`);
    }
    if (!provided) provided = `choice_${index + 1}`;
    if (usedNames.has(provided)) {
      errors.push(
        `choice name "${provided}" is already used in "${listName}"; try "${uniqueName(provided, usedNames)}"`,
      );
      return;
    }
    usedNames.add(provided);
    cells[nameKey] = provided;

    const resolved = resolveLocalizedMap(next, 'choices', 'label', label);
    next = resolved.data;
    errors.push(...resolved.errors.map((error) => `choice ${index}: ${error}`));
    Object.assign(cells, resolved.cells);

    for (const [filter, value] of Object.entries(choice.filters ?? {})) {
      const column = filter.trim();
      if (!column || value === '') continue;
      next = ensureColumn(next, 'choices', column);
      cells[column] = value;
    }

    inserts.push({
      id: options.newId ? options.newId() : newRowId(),
      cells,
      meta: { nameLocked: true },
    });
  });

  if (errors.length > 0) return fail(data, errors);

  if (input.mode === 'replace' && existingRows.length > 0) {
    next = deleteRows(
      next,
      'choices',
      existingRows.map((row) => row.id),
    );
  }
  const at =
    input.mode === 'replace'
      ? Math.max(
          0,
          Math.min(
            firstExistingIndex < 0 ? next.choices.rows.length : firstExistingIndex,
            next.choices.rows.length,
          ),
        )
      : next.choices.rows.length;

  next = insertRows(next, 'choices', at, inserts);
  const verb = input.mode === 'replace' ? 'replaced' : 'appended';
  return succeed(next, `${verb} list "${listName}" with ${inserts.length} choice(s)`);
}

interface DeleteInput {
  targetNames: string[];
}

function applyDelete(data: WorkbookData, input: DeleteInput): ApplyToolOutcome {
  const errors: string[] = [];
  const targets = new Set<RowId>();
  for (const target of input.targetNames) {
    const row = resolveTargetRow(data, target);
    if (!row) errors.push(`row not found: "${target}"`);
    else targets.add(row.id);
  }
  if (errors.length > 0) return fail(data, errors);

  const tree = buildGroupTree(data.survey);
  const endToBegin = new Map<RowId, RowId>();
  for (const [beginId, endId] of tree.matchingEnd) endToBegin.set(endId, beginId);

  for (const group of tree.groups) {
    if (group.endRowIndex < 0) continue;
    const endId = tree.matchingEnd.get(group.id);
    if (!endId) continue;
    if (targets.has(group.id) && !targets.has(endId)) {
      errors.push(`deleting group "${group.name || group.id}" also requires its end row`);
    }
    if (targets.has(endId) && !targets.has(group.id)) {
      errors.push(
        `deleting the end row of "${group.name || group.id}" also requires its begin row`,
      );
    }
  }
  if (errors.length > 0) return fail(data, errors);
  return succeed(deleteRows(data, 'survey', [...targets]), `deleted ${targets.size} survey row(s)`);
}

export function applyToolCall(
  data: WorkbookData,
  name: ToolName,
  input: unknown,
  options: ApplyToolOptions = {},
): ApplyToolOutcome {
  const parsed = parseToolInput(name, input);
  if (!parsed.ok) return fail(data, parsed.errors);
  switch (name) {
    case 'insert_survey_rows':
      return applyInsert(data, parsed.input as InsertInput, options);
    case 'update_survey_cells':
      return applyUpdate(data, parsed.input as UpdateInput, options);
    case 'upsert_choice_list':
      return applyUpsert(data, parsed.input as UpsertInput, options);
    case 'delete_survey_rows':
      return applyDelete(data, parsed.input as DeleteInput);
  }
}
