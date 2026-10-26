/**
 * Token-efficient context summary for the AI assistant (Task 6.4, PRD §4.7).
 *
 * Pure and deterministic: same workbook + selection + diagnostics produce the
 * same string, so prompts are cacheable and tests can snapshot the output.
 */
import type { AllIndexes } from '../indexes';
import type { DiagnosticIssue } from '../lint';
import { defaultLanguage, discoverLanguages } from '../languages/discover';
import { readSettings } from '../model/settings';
import type { ManagedSheetName, RowId, SheetData, WorkbookData } from '../model/types';

/** Plan default (Task 6.4): the reference form must fit in this budget. */
export const DEFAULT_CONTEXT_BUDGET = 8_000;

/** 4 characters ≈ 1 token (Task 6.4). */
export const CHARS_PER_TOKEN = 4;

const LABEL_LIMIT = 60;
const ERROR_LIMIT = 50;
const CHOICE_LIMIT = 8;
const CHOICE_LIMIT_SHORT = 4;
const OUTLINE_WINDOW = 10;

export interface ContextSelection {
  sheet: ManagedSheetName;
  rowIds: readonly RowId[];
}

export interface ContextUiState {
  activeSheet: ManagedSheetName;
  /** Rows the user has selected, in display order. */
  selectedRowIds?: readonly RowId[];
}

export interface BuildContextOptions {
  budgetTokens?: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function oneLine(value: string, limit = LABEL_LIMIT): string {
  const flattened = value.replace(/\s+/g, ' ').trim();
  return flattened.length > limit ? `${flattened.slice(0, Math.max(0, limit - 1))}…` : flattened;
}

function cell(sheet: SheetData, rowId: RowId, column: string): string {
  const row = sheet.rows.find((candidate) => candidate.id === rowId);
  return row?.cells[column] ?? '';
}

function sheetFor(data: WorkbookData, sheet: ManagedSheetName): SheetData {
  return data[sheet];
}

function selectionRows(
  data: WorkbookData,
  ui: ContextUiState,
): Array<{
  index: number;
  sheet: ManagedSheetName;
  rowId: RowId;
}> {
  const selected = new Set(ui.selectedRowIds ?? []);
  const result: Array<{ index: number; sheet: ManagedSheetName; rowId: RowId }> = [];
  for (const sheetName of [ui.activeSheet]) {
    const sheet = sheetFor(data, sheetName);
    sheet.rows.forEach((row, index) => {
      if (selected.has(row.id)) result.push({ index, sheet: sheetName, rowId: row.id });
    });
  }
  return result;
}

function headerBlock(data: WorkbookData, ui: ContextUiState): string {
  const settings = readSettings(data.settings);
  const languages = discoverLanguages(data)
    .map((language) => language.display)
    .join(', ');
  const primary = defaultLanguage(data);
  return [
    'XLSForm context',
    `form_title: ${settings.formTitle ?? '(untitled)'}`,
    `form_id: ${settings.formId ?? '(none)'}`,
    `version: ${settings.version ?? '(none)'}`,
    `languages: ${languages || 'Default'}`,
    `default_language: ${primary?.display ?? 'Default'}`,
    `active_sheet: ${ui.activeSheet}`,
  ].join('\n');
}

function selectedBlock(data: WorkbookData, ui: ContextUiState): string {
  const rows = selectionRows(data, ui);
  if (rows.length === 0) return 'selected_rows: none';
  const lines = [`selected_rows: ${rows.length}`];
  for (const entry of rows) {
    const sheet = sheetFor(data, entry.sheet);
    lines.push(`${entry.sheet}#${entry.index}`);
    for (const column of sheet.columns) {
      const value = cell(sheet, entry.rowId, column);
      if (!value) continue;
      lines.push(`  ${column}: ${oneLine(value, 400)}`);
    }
  }
  return lines.join('\n');
}

function outlineLines(data: WorkbookData, indexes: AllIndexes): string[] {
  const survey = data.survey;
  return indexes.variables.order.map((variable) => {
    const sheetRow = survey.rows[variable.rowIndex];
    const type = (sheetRow?.cells.type ?? variable.questionType).trim();
    const label = oneLine(variable.primaryLabel);
    const path = variable.groupPath.join(' / ');
    return `${variable.rowIndex} | ${type} | ${variable.name} | ${label} | ${path}`;
  });
}

function fullOutline(data: WorkbookData, indexes: AllIndexes): string {
  return [
    'outline: rowIndex | type | name | label | groupPath',
    ...outlineLines(data, indexes),
  ].join('\n');
}

/**
 * Keep a window of outline lines around the selected rows and replace each
 * run outside it with a group summary such as `… 120 rows in household …`.
 * Unselected forms keep the first rows plus summaries, so the header stays
 * useful.
 */
function elidedOutline(
  data: WorkbookData,
  indexes: AllIndexes,
  selectedIndexes: ReadonlySet<number>,
): string {
  const lines = outlineLines(data, indexes);
  const keep = new Set<number>();
  if (selectedIndexes.size === 0) {
    for (let index = 0; index < Math.min(OUTLINE_WINDOW, lines.length); index += 1) keep.add(index);
  } else {
    for (const index of selectedIndexes) {
      for (let offset = -OUTLINE_WINDOW; offset <= OUTLINE_WINDOW; offset += 1) {
        const target = index + offset;
        if (target >= 0 && target < lines.length) keep.add(target);
      }
    }
  }

  const result = ['outline: rowIndex | type | name | label | groupPath (elided)'];
  let cursor = 0;
  while (cursor < lines.length) {
    if (keep.has(cursor)) {
      result.push(lines[cursor] as string);
      cursor += 1;
      continue;
    }
    const start = cursor;
    let end = cursor + 1;
    while (end < lines.length && !keep.has(end)) end += 1;

    // Split the elided run at group boundaries so the model still sees where
    // large blocks live without paying for every row.
    let runStart = start;
    let previousPath = groupPathAt(indexes, runStart);
    for (let index = start + 1; index <= end; index += 1) {
      const path = index < end ? groupPathAt(indexes, index) : null;
      if (path === previousPath) continue;
      const count = index - runStart;
      result.push(`… ${count} rows in ${oneLine(previousPath, 80)}`);
      runStart = index;
      previousPath = path ?? '';
    }
    cursor = end;
  }
  return result.join('\n');
}

function groupPathAt(indexes: AllIndexes, outlineIndex: number): string {
  const variable = indexes.variables.order[outlineIndex];
  return variable?.groupPath.join(' / ') || 'form';
}

function choiceLines(data: WorkbookData, indexes: AllIndexes, limit: number): string {
  const listNameKey = data.choices.columns.find((column) => column.toLowerCase() === 'list_name');
  const nameKey = data.choices.columns.find((column) => column.toLowerCase() === 'name');
  if (!listNameKey || !nameKey) return 'choices: none';
  const lines: string[] = [];
  for (const [listName, rows] of Object.entries(indexes.choices.byList)) {
    const names = rows.map((row) => (row.cells[nameKey] ?? '').trim()).filter(Boolean);
    const shown = names.slice(0, limit);
    const more = names.length > limit ? ` (+${names.length - limit} more)` : '';
    lines.push(`${listName}: [${shown.join(', ')}]${more}`);
  }
  return ['choices:', ...lines].join('\n');
}

function errorsBlock(indexes: AllIndexes, diagnostics: readonly DiagnosticIssue[]): string {
  if (diagnostics.length === 0) return 'lint_errors: none';
  const lines = [`lint_errors: ${diagnostics.length} (first ${ERROR_LIMIT})`];
  for (const issue of diagnostics.slice(0, ERROR_LIMIT)) {
    const rowIndex = indexes.rowIndexes[issue.sheet].get(issue.rowId);
    const location = rowIndex === undefined ? issue.sheet : `${issue.sheet}#${rowIndex}`;
    const column = issue.column ? ` ${issue.column}` : '';
    lines.push(
      `${location}${column} [${issue.ruleId}] ${issue.severity}: ${oneLine(issue.message, 160)}`,
    );
  }
  return lines.join('\n');
}

/**
 * Build the compact schema summary sent to the model.
 *
 * Order: header, selected rows (always full), outline (elided when needed),
 * choice signatures (shortened when needed), linter errors (always kept).
 */
export function buildContext(
  data: WorkbookData,
  indexes: AllIndexes,
  ui: ContextUiState,
  diagnostics: readonly DiagnosticIssue[],
  options: BuildContextOptions = {},
): string {
  const budget = options.budgetTokens ?? DEFAULT_CONTEXT_BUDGET;
  const selectedIndexes = new Set(selectionRows(data, ui).map((row) => row.index));

  const header = headerBlock(data, ui);
  const selected = selectedBlock(data, ui);
  const errors = errorsBlock(indexes, diagnostics);

  const assemble = (outline: string, choices: string): string =>
    [header, selected, outline, choices, errors].join('\n\n');

  const fullChoices = choiceLines(data, indexes, CHOICE_LIMIT);
  const full = assemble(fullOutline(data, indexes), fullChoices);
  if (estimateTokens(full) <= budget) return full;

  const compactChoices = choiceLines(data, indexes, CHOICE_LIMIT_SHORT);
  const withElided = assemble(elidedOutline(data, indexes, selectedIndexes), compactChoices);
  if (estimateTokens(withElided) <= budget) return withElided;

  // Last resort: the outline is the largest optional block. Selected rows and
  // errors are always kept (Task 6.4 acceptance criteria).
  const withoutOutline = assemble('outline: omitted (context budget)', compactChoices);
  if (estimateTokens(withoutOutline) <= budget) return withoutOutline;
  return assemble('outline: omitted (context budget)', 'choices: omitted (context budget)');
}
