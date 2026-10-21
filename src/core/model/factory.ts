/**
 * Workbook and row factories. IDs are internal only (AD-4).
 */
import { customAlphabet } from 'nanoid';

import {
  DEFAULT_CHOICES_COLUMNS,
  DEFAULT_SETTINGS_COLUMNS,
  DEFAULT_SURVEY_COLUMNS,
} from './columns';
import type { ColumnKey, Row, SheetData, WorkbookData } from './types';

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const randomId = customAlphabet(ID_ALPHABET, 12);

/** New internal row id. */
export function newRowId(): string {
  return randomId();
}

function emptySheet(sheetName: string, columns: readonly ColumnKey[]): SheetData {
  return { sheetName, columns: [...columns], rows: [] };
}

export function createRow(cells: Record<ColumnKey, string> = {}): Row {
  return { id: newRowId(), cells: { ...cells } };
}

/** A settings row with the PRD defaults; `form_id` is unique per workbook. */
const randomFormId = customAlphabet(ID_ALPHABET, 8);

export function createSettingsRow(formId = `form_${randomFormId()}`): Row {
  return createRow({
    form_title: 'Untitled form',
    form_id: formId,
    version: '1',
  });
}

/**
 * A blank workbook with the default presets. The writer can emit it directly as
 * a valid XLSForm (three sheets, headers, one settings row).
 */
export function createEmptyWorkbook(): WorkbookData {
  const survey = emptySheet('survey', DEFAULT_SURVEY_COLUMNS);
  const choices = emptySheet('choices', DEFAULT_CHOICES_COLUMNS);
  const settings = emptySheet('settings', DEFAULT_SETTINGS_COLUMNS);
  settings.rows.push(createSettingsRow());

  return {
    survey,
    choices,
    settings,
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}
