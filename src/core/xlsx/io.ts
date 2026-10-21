/**
 * ExcelJS declares its own global `Buffer` interface, which clashes with
 * Node's generic `Buffer` under `@types/node` 24. IPC and file APIs hand us
 * `Uint8Array`, so normalise the type at the one boundary.
 */
import type ExcelJS from 'exceljs';

type ExcelLoadArg = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

export function toExcelBuffer(bytes: Uint8Array): ExcelLoadArg {
  return bytes as unknown as ExcelLoadArg;
}
