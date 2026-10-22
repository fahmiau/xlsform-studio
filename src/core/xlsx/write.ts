/**
 * XLSX writer (master plan Task 1.6).
 *
 * With a `sourceHandle`, only the managed sheets' cell values are rewritten;
 * styles, widths, frozen panes, and every passthrough sheet stay untouched
 * (AD-6). Without a handle, a fresh workbook is built with a bold, frozen
 * header row.
 */
import ExcelJS, { type Worksheet } from 'exceljs';

import type { ColumnKey, SheetData, WorkbookData } from '../model/types';

export interface WriteOptions {
  /** Workbook returned by `readWorkbook`; enables in-place style-preserving saves. */
  sourceHandle?: ExcelJS.Workbook;
}

function headerCellValue(sheet: SheetData, key: ColumnKey): string {
  return sheet.headerText?.[key] ?? key;
}

function findWorksheet(workbook: ExcelJS.Workbook, sheetName: string): Worksheet | undefined {
  const wanted = sheetName.trim().toLowerCase();
  return workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() === wanted);
}

/** First row that holds a value; 1 for empty sheets. */
function firstValueRow(worksheet: Worksheet): number {
  let first = Number.POSITIVE_INFINITY;
  worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    if (rowNumber < first) first = rowNumber;
  });
  return Number.isFinite(first) ? first : 1;
}

/** Last row that holds a value; 0 when the sheet is empty. */
function lastValueRow(worksheet: Worksheet): number {
  let last = 0;
  worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    if (rowNumber > last) last = rowNumber;
  });
  return last;
}

interface ColumnTarget {
  key: ColumnKey;
  original: string;
  index: number;
  isNew: boolean;
}

/**
 * Map model columns onto worksheet columns. Existing headers are reused when
 * their original text matches; unknown columns are appended at the end.
 */
function targetColumns(
  sheet: SheetData,
  worksheet: Worksheet,
  headerRow: number,
): { targets: ColumnTarget[]; maxColumn: number } {
  const existing = new Map<string, number[]>();
  const emptyHeaderColumns: number[] = [];
  const header = worksheet.getRow(headerRow);
  const maxColumn = Math.max(worksheet.columnCount, sheet.columns.length);
  for (let column = 1; column <= maxColumn; column += 1) {
    const cell = header.getCell(column);
    const text = cell.value === null || cell.value === undefined ? '' : String(cell.text ?? '');
    if (text === '') {
      // Headerless columns are matched positionally: the reader names them
      // `column_N` but keeps the original empty header in `headerText`.
      emptyHeaderColumns.push(column);
      continue;
    }
    const list = existing.get(text) ?? [];
    list.push(column);
    existing.set(text, list);
  }

  const claimed = new Set<number>();
  const targets: ColumnTarget[] = [];
  let nextIndex = maxColumn + 1;
  for (const key of sheet.columns) {
    const original = headerCellValue(sheet, key);
    if (original === '') {
      const encoded = /^column_(\d+)$/.exec(key)?.[1];
      const preferred = encoded === undefined ? undefined : Number(encoded);
      const index =
        (preferred !== undefined &&
        emptyHeaderColumns.includes(preferred) &&
        !claimed.has(preferred)
          ? preferred
          : emptyHeaderColumns.find((candidate) => !claimed.has(candidate))) ?? nextIndex;
      if (index === nextIndex) nextIndex += 1;
      claimed.add(index);
      targets.push({ key, original, index, isNew: !emptyHeaderColumns.includes(index) });
      continue;
    }
    const candidates = existing.get(original) ?? [];
    const index = candidates.find((candidate) => !claimed.has(candidate));
    if (index !== undefined) {
      claimed.add(index);
      targets.push({ key, original, index, isNew: false });
    } else {
      claimed.add(nextIndex);
      targets.push({ key, original, index: nextIndex, isNew: true });
      nextIndex += 1;
    }
  }
  return { targets, maxColumn: Math.max(maxColumn, ...claimed) };
}

function copyHeaderStyle(
  worksheet: Worksheet,
  headerRow: number,
  fromColumn: number,
  toColumn: number,
) {
  if (fromColumn === toColumn) return;
  const source = worksheet.getRow(headerRow).getCell(fromColumn);
  const target = worksheet.getRow(headerRow).getCell(toColumn);
  target.style = { ...source.style };
}

function rewriteManagedSheet(sheet: SheetData, worksheet: Worksheet): void {
  const headerRow = firstValueRow(worksheet);
  const oldMaxColumn = worksheet.columnCount;
  const oldLastRow = lastValueRow(worksheet);
  const { targets, maxColumn } = targetColumns(sheet, worksheet, headerRow);
  const header = worksheet.getRow(headerRow);
  const styleSource = targets[0]?.index ?? 1;

  for (const target of targets) {
    const cell = header.getCell(target.index);
    if (target.original === '') continue;
    if (target.isNew) {
      cell.value = target.original;
      copyHeaderStyle(worksheet, headerRow, styleSource, target.index);
    } else if (cell.value === null || cell.value === undefined) {
      cell.value = target.original;
    }
  }

  const dataRowCount = sheet.rows.length;
  for (let offset = 0; offset < dataRowCount; offset += 1) {
    const sourceRow = sheet.rows[offset];
    const row = worksheet.getRow(headerRow + offset + 1);
    for (const target of targets) {
      const text = sourceRow?.cells[target.key] ?? '';
      row.getCell(target.index).value = text === '' ? null : text;
    }
    row.commit();
  }

  // Clear rows that existed before but no longer hold data.
  for (let rowNumber = headerRow + dataRowCount + 1; rowNumber <= oldLastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= maxColumn; column += 1) {
      row.getCell(column).value = null;
    }
    row.commit();
  }

  // A deleted column must not leave its header or data behind. Headerless
  // columns are included here, so removing `column_N` also clears its cells.
  const claimed = new Set(targets.map((target) => target.index));
  for (let column = 1; column <= oldMaxColumn; column += 1) {
    if (claimed.has(column)) continue;
    for (
      let rowNumber = headerRow;
      rowNumber <= Math.max(oldLastRow, headerRow + dataRowCount);
      rowNumber += 1
    ) {
      worksheet.getRow(rowNumber).getCell(column).value = null;
    }
  }
}

function buildFreshSheet(workbook: ExcelJS.Workbook, sheet: SheetData): Worksheet {
  const worksheet = workbook.addWorksheet(sheet.sheetName);
  const keys = sheet.columns;
  const header = worksheet.addRow(keys.map((key) => headerCellValue(sheet, key)));
  for (let index = 0; index < keys.length; index += 1) {
    const cell = header.getCell(index + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
  }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of sheet.rows) {
    worksheet.addRow(keys.map((key) => (row.cells[key] === '' ? null : (row.cells[key] ?? null))));
  }

  // Reasonable widths: longest value or header, capped. Computed with a loop so
  // large sheets do not spread huge arrays.
  keys.forEach((key, index) => {
    let width = headerCellValue(sheet, key).length;
    for (const row of sheet.rows) {
      const length = (row.cells[key] ?? '').length;
      if (length > width) width = length;
    }
    worksheet.getColumn(index + 1).width = Math.min(60, Math.max(10, width + 2));
  });

  return worksheet;
}

function applySheetOrder(workbook: ExcelJS.Workbook, sheetOrder: string[]): void {
  const positions = new Map<string, number>();
  sheetOrder.forEach((name, index) => {
    positions.set(name.trim().toLowerCase(), index);
  });
  let fallback = sheetOrder.length;
  for (const worksheet of workbook.worksheets) {
    const position = positions.get(worksheet.name.trim().toLowerCase());
    (worksheet as unknown as { orderNo: number }).orderNo = position ?? fallback++;
  }
}

export async function writeWorkbook(
  data: WorkbookData,
  options: WriteOptions = {},
): Promise<Uint8Array> {
  const source = options.sourceHandle;
  const workbook = source ?? new ExcelJS.Workbook();

  if (!source) {
    workbook.creator = 'xlsform-studio';
    workbook.created = new Date();
    workbook.modified = new Date();
  }

  const managed: SheetData[] = [data.survey, data.choices, data.settings];
  for (const sheet of managed) {
    const worksheet = findWorksheet(workbook, sheet.sheetName);
    if (!worksheet) {
      // A sheet that did not exist in the source (reader defaulted it).
      buildFreshSheet(workbook, sheet);
      continue;
    }
    rewriteManagedSheet(sheet, worksheet);
  }

  applySheetOrder(workbook, data.sheetOrder);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
