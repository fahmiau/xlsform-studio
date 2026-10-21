/**
 * Plain-data model for an XLSForm workbook (master plan AD-4).
 *
 * This module is pure TypeScript: no React, no Zustand, no Tauri (AD-1).
 */

/** Internal row identity. Never exported to `.xlsx`. */
export type RowId = string;

/** Header text exactly as it appears in the file (AD-5). */
export type ColumnKey = string;

/** Per-row metadata that has no column in the spreadsheet. */
export interface RowMeta {
  /**
   * Set on choices whose `name` must not follow label edits (PRD §4.3, AD-14).
   */
  nameLocked?: boolean;
}

export interface Row {
  id: RowId;
  /** Cell values keyed by the verbatim header. Missing or empty means `''`. */
  cells: Record<ColumnKey, string>;
  meta?: RowMeta;
}

export interface SheetData {
  /** Original sheet name, preserved verbatim (`survey`, `Survey`, custom). */
  sheetName: string;
  columns: ColumnKey[];
  rows: Row[];
  /**
   * Original header text when the model key differs (duplicate headers get a
   * `#2` key, headerless data columns get `column_N`). Internal only: the
   * writer emits the original text so saves do not rename headers.
   */
  headerText?: Record<ColumnKey, string>;
}

/**
 * An unmanaged sheet re-emitted verbatim through the source workbook. Only the
 * name is modelled; the bytes live in the reader's `sourceHandle` (AD-6).
 */
export interface PassthroughSheet {
  sheetName: string;
}

export interface WorkbookData {
  survey: SheetData;
  choices: SheetData;
  /** Zero or one data row in practice, but always modelled as a sheet. */
  settings: SheetData;
  passthrough: PassthroughSheet[];
  /** Original tab order, including passthrough sheets. */
  sheetOrder: string[];
}

/** Sheet names managed by the editor. */
export type ManagedSheetName = 'survey' | 'choices' | 'settings';

export const MANAGED_SHEETS: readonly ManagedSheetName[] = ['survey', 'choices', 'settings'];
