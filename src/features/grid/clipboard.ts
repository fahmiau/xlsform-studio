/**
 * Excel-compatible TSV clipboard (Task 2.5). Parsing/serializing is pure and
 * unit tested; the grid hooks route Glide's copy/paste through this module.
 */
import { findColumnKey } from '@/core/indexes/columns';
import type {
  ColumnKey,
  ManagedSheetName,
  RowId,
  SheetData,
  WorkbookData,
} from '@/core/model/types';
import { setCells, type CellEdit } from '@/core/ops/cells';
import { insertRows } from '@/core/ops/rows';

import { isCellEditable } from './editability';

function escapeCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeTsv(matrix: readonly (readonly string[])[]): string {
  return matrix.map((row) => row.map(escapeCell).join('\t')).join('\n');
}

/**
 * Parse TSV with Excel quoting rules: tabs/newlines separate cells/rows unless
 * quoted, `""` is a literal quote, and CRLF is accepted. A trailing newline
 * does not add an empty row.
 */
export function parseTsv(text: string): string[][] {
  if (text === '') return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (char === '\r' && text[index + 1] === '\n') {
        cell += '\n';
        index += 1;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === '') {
      inQuotes = true;
    } else if (char === '\t') {
      pushCell();
    } else if (char === '\r') {
      pushRow();
      if (text[index + 1] === '\n') index += 1;
    } else if (char === '\n') {
      pushRow();
    } else {
      cell += char;
    }
  }

  // Flush the final row unless the text ended with a row separator.
  const endsWithSeparator = text.endsWith('\n') || text.endsWith('\r');
  if (!endsWithSeparator || cell !== '' || row.length > 0) pushRow();

  return rows;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Rich `text/html` table for pasting into Google Sheets/Word. */
export function toHtmlTable(matrix: readonly (readonly string[])[]): string {
  const body = matrix
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell).replaceAll('\n', '<br>')}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table>${body}</table>`;
}

/** Cell matrix for a rectangular selection, gutter already excluded. */
export function matrixFromSheet(
  sheet: SheetData,
  rowIndexes: readonly number[],
  keys: readonly ColumnKey[],
): string[][] {
  return rowIndexes.map((rowIndex) => keys.map((key) => sheet.rows[rowIndex]?.cells[key] ?? ''));
}

export interface PasteMatrixResult {
  data: WorkbookData;
  applied: number;
  skippedReadOnly: number;
  droppedColumns: number;
  appendedRows: number;
  rowIds: RowId[];
}

export interface PasteMatrixOptions {
  /**
   * Real row index for each visible row. Folding passes the projection so a
   * paste across a collapsed region lands only on visible rows (Task 3.7).
   */
  rowIndexes?: ArrayLike<number>;
}

/**
 * Paste at a data-column start. Extra rows are appended after all real sheet
 * rows (even when folding hides them), columns beyond the available ones are
 * dropped, and read-only cells are skipped. Callers wrap the result in one
 * store `apply` for a single undo step.
 */
export function pasteMatrix(
  data: WorkbookData,
  sheetName: ManagedSheetName,
  start: { rowIndex: number; columnIndex: number },
  matrix: readonly (readonly string[])[],
  keys: readonly ColumnKey[],
  options: PasteMatrixOptions = {},
): PasteMatrixResult {
  const cleaned: string[][] = matrix.length > 0 ? matrix.map((row) => [...row]) : [];
  if (cleaned.length === 0) {
    return { data, applied: 0, skippedReadOnly: 0, droppedColumns: 0, appendedRows: 0, rowIds: [] };
  }

  const available = keys.slice(start.columnIndex);
  const droppedColumns = Math.max(0, (cleaned[0]?.length ?? 0) - available.length);
  const height = cleaned.length;
  const existing = data[sheetName].rows.length;
  const startRow = Math.max(0, start.rowIndex);

  const targets: number[] = [];
  let missing = 0;
  if (options.rowIndexes) {
    for (let offset = 0; offset < height; offset += 1) {
      const real = options.rowIndexes[startRow + offset];
      if (real === undefined || real < 0) missing += 1;
      else targets.push(real);
    }
  } else {
    missing = Math.max(0, startRow + height - existing);
    for (let offset = 0; offset < height - missing; offset += 1) targets.push(startRow + offset);
  }

  let next = data;
  if (missing > 0) {
    next = insertRows(
      next,
      sheetName,
      existing,
      Array.from({ length: missing }, () => ({ cells: {} })),
    );
    for (let offset = 0; offset < missing; offset += 1) targets.push(existing + offset);
  }

  const sheet = next[sheetName];
  const typeKey = findColumnKey(sheet, 'type') ?? 'type';
  const edits: CellEdit[] = [];
  const rowIds: RowId[] = [];
  let skippedReadOnly = 0;

  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    const target = targets[rowOffset];
    const row = target === undefined ? undefined : sheet.rows[target];
    if (!row) continue;
    rowIds.push(row.id);
    const sourceRow = cleaned[rowOffset] ?? [];
    for (let columnOffset = 0; columnOffset < available.length; columnOffset += 1) {
      const column = available[columnOffset];
      const value = sourceRow[columnOffset];
      if (column === undefined || value === undefined) continue;
      if (!isCellEditable(row.cells[typeKey] ?? '', column)) {
        skippedReadOnly += 1;
        continue;
      }
      if ((row.cells[column] ?? '') === value) continue;
      edits.push({ rowId: row.id, column, value });
    }
  }

  if (edits.length > 0) next = setCells(next, sheetName, edits);

  return {
    data: next,
    applied: edits.length,
    skippedReadOnly,
    droppedColumns,
    appendedRows: missing,
    rowIds,
  };
}
