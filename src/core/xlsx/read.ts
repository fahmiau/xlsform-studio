/**
 * XLSX reader (master plan Task 1.5).
 *
 * Reads a workbook into the plain-data model, keeps headers verbatim, and keeps
 * the ExcelJS workbook as an opaque `sourceHandle` so the writer can edit only
 * the managed sheets (AD-6).
 */
import ExcelJS, { type Worksheet } from 'exceljs';

import { newRowId } from '../model/factory';
import {
  DEFAULT_CHOICES_COLUMNS,
  DEFAULT_SETTINGS_COLUMNS,
  DEFAULT_SURVEY_COLUMNS,
} from '../model/columns';
import type { ColumnKey, ManagedSheetName, Row, SheetData, WorkbookData } from '../model/types';
import { coerceCell } from './coerce';
import { toExcelBuffer } from './io';

export interface ReadOptions {
  /**
   * AD-14 hook: infer `meta.nameLocked` on choices. The slugifier lands in
   * Stage 3; until then this is a no-op.
   */
  inferNameLocks?: (choices: SheetData) => void;
}

export interface ReadResult {
  data: WorkbookData;
  warnings: string[];
  /** Opaque in-memory workbook used for style-preserving writes. */
  sourceHandle: ExcelJS.Workbook;
}

export class WorkbookReadError extends Error {
  readonly code: 'missing-survey' | 'invalid-workbook';

  constructor(code: 'missing-survey' | 'invalid-workbook', message: string) {
    super(message);
    this.name = 'WorkbookReadError';
    this.code = code;
  }
}

const MANAGED: readonly ManagedSheetName[] = ['survey', 'choices', 'settings'];

const DEFAULT_COLUMNS: Record<ManagedSheetName, readonly ColumnKey[]> = {
  survey: DEFAULT_SURVEY_COLUMNS,
  choices: DEFAULT_CHOICES_COLUMNS,
  settings: DEFAULT_SETTINGS_COLUMNS,
};

function sheetText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'formula' in value) {
    // Headers are never formulas in practice, but be defensive.
    return coerceCell(value);
  }
  if (typeof value === 'number' && cell.numFmt) {
    return coerceCell(value, { numFmt: cell.numFmt, text: cell.text });
  }
  return coerceCell(value);
}

interface CellText {
  column: number;
  text: string;
}

interface RowText {
  rowNumber: number;
  cells: CellText[];
}

/**
 * Snapshot only rows that actually hold values. Some exporters mark the sheet
 * dimension as the full 1,048,576 rows, so iterating `rowCount` would allocate
 * a million empty rows; `eachRow({ includeEmpty: false })` walks the defined
 * rows instead.
 */
function snapshotRows(worksheet: Worksheet): { rows: RowText[]; maxColumn: number } {
  const rows: RowText[] = [];
  let maxColumn = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: CellText[] = [];
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const text = sheetText(cell);
      if (text === '') return;
      cells.push({ column, text });
      if (column > maxColumn) maxColumn = column;
    });
    if (cells.length > 0) rows.push({ rowNumber, cells });
  });
  return { rows, maxColumn };
}

function uniqueHeader(header: string, used: Set<string>, warnings: string[], sheetName: string) {
  if (!used.has(header)) {
    used.add(header);
    return header;
  }
  let counter = 2;
  let candidate = `${header}#${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${header}#${counter}`;
  }
  used.add(candidate);
  warnings.push(
    `[duplicate-header] Sheet "${sheetName}" has more than one "${header}" column; the duplicate was renamed to "${candidate}".`,
  );
  return candidate;
}

function parseManagedSheet(
  worksheet: Worksheet,
  sheetName: string,
  warnings: string[],
): { sheet: SheetData } {
  const { rows: snapshots, maxColumn } = snapshotRows(worksheet);
  if (snapshots.length === 0) {
    return { sheet: { sheetName, columns: [], rows: [] } };
  }

  const headerSnapshot = snapshots[0] as RowText;
  const headerRowNumber = headerSnapshot.rowNumber;
  const headerByColumn = new Map<number, string>();
  for (const cell of headerSnapshot.cells) headerByColumn.set(cell.column, cell.text);

  const usedColumns: Array<{ index: number; header: string; original: string }> = [];
  const headers = new Set<string>();

  for (let column = 1; column <= maxColumn; column += 1) {
    const rawHeader = headerByColumn.get(column) ?? '';
    if (rawHeader.trim() === '') {
      const hasData = snapshots.some(
        (snapshot) =>
          snapshot.rowNumber > headerRowNumber &&
          snapshot.cells.some((cell) => cell.column === column),
      );
      // Fully empty header column without data: drop it.
      if (!hasData) continue;
      warnings.push(
        `[empty-header] Sheet "${sheetName}" has data in column ${column} without a header; it was kept as "column_${column}".`,
      );
    }
    const original = rawHeader.trim() === '' ? '' : rawHeader;
    const header = uniqueHeader(
      rawHeader.trim() === '' ? `column_${column}` : rawHeader,
      headers,
      warnings,
      sheetName,
    );
    usedColumns.push({ index: column, header, original });
  }

  const rows: Row[] = [];
  let expectedRowNumber = headerRowNumber + 1;
  for (const snapshot of snapshots.slice(1)) {
    while (expectedRowNumber < snapshot.rowNumber) {
      rows.push({ id: newRowId(), cells: {} });
      expectedRowNumber += 1;
    }
    const byColumn = new Map(snapshot.cells.map((cell) => [cell.column, cell.text]));
    const cells: Record<ColumnKey, string> = {};
    for (const { index, header } of usedColumns) {
      const text = byColumn.get(index);
      if (text !== undefined && text !== '') cells[header] = text;
    }
    rows.push({ id: newRowId(), cells });
    expectedRowNumber = snapshot.rowNumber + 1;
  }

  // Keep interior blank rows (visual separators), trim trailing ones.
  while (rows.length > 0 && Object.keys(rows[rows.length - 1]?.cells ?? {}).length === 0) {
    rows.pop();
  }

  const headerText: Record<ColumnKey, string> = {};
  for (const column of usedColumns) {
    // An empty original header is still meaningful: the writer must reuse the
    // headerless worksheet column instead of appending a new one.
    if (column.original !== column.header) headerText[column.header] = column.original;
  }

  const sheet: SheetData = {
    sheetName,
    columns: usedColumns.map((column) => column.header),
    rows,
  };
  if (Object.keys(headerText).length > 0) sheet.headerText = headerText;
  return { sheet };
}

function defaultSheet(sheetName: string, kind: ManagedSheetName): SheetData {
  return { sheetName, columns: [...DEFAULT_COLUMNS[kind]], rows: [] };
}

function findSheet(workbook: ExcelJS.Workbook, name: ManagedSheetName): Worksheet | undefined {
  return workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() === name);
}

export async function readWorkbook(
  bytes: Uint8Array,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toExcelBuffer(bytes));
  } catch (error) {
    throw new WorkbookReadError(
      'invalid-workbook',
      `The file is not a readable .xlsx workbook: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const warnings: string[] = [];
  const surveySheet = findSheet(workbook, 'survey');
  if (!surveySheet) {
    throw new WorkbookReadError(
      'missing-survey',
      'This workbook has no "survey" sheet. XLSForm files need at least a survey sheet.',
    );
  }

  const survey = parseManagedSheet(surveySheet, surveySheet.name, warnings).sheet;

  const choicesWorksheet = findSheet(workbook, 'choices');
  let choices: SheetData;
  if (choicesWorksheet) {
    choices = parseManagedSheet(choicesWorksheet, choicesWorksheet.name, warnings).sheet;
  } else {
    choices = defaultSheet('choices', 'choices');
    warnings.push('[missing-sheet] No "choices" sheet; an empty one will be created on save.');
  }

  const settingsWorksheet = findSheet(workbook, 'settings');
  let settings: SheetData;
  if (settingsWorksheet) {
    settings = parseManagedSheet(settingsWorksheet, settingsWorksheet.name, warnings).sheet;
  } else {
    settings = defaultSheet('settings', 'settings');
    warnings.push('[missing-sheet] No "settings" sheet; an empty one will be created on save.');
  }

  const managedLower = new Set(MANAGED);
  const passthrough = workbook.worksheets
    .filter(
      (worksheet) => !managedLower.has(worksheet.name.trim().toLowerCase() as ManagedSheetName),
    )
    .map((worksheet) => ({ sheetName: worksheet.name }));

  const sheetOrder = workbook.worksheets.map((worksheet) => worksheet.name);
  // The model always has the three managed sheets; reflect sheets the reader
  // defaulted so a save does not silently reorder them.
  for (const name of MANAGED) {
    if (!workbook.worksheets.some((worksheet) => worksheet.name.trim().toLowerCase() === name)) {
      sheetOrder.push(name);
    }
  }

  const data: WorkbookData = {
    survey,
    choices,
    settings,
    passthrough,
    sheetOrder,
  };

  options.inferNameLocks?.(choices);

  return { data, warnings, sourceHandle: workbook };
}
