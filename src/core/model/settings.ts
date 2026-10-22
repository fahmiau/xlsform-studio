/**
 * Settings-sheet values the indexes and linter need. Pure and defensive:
 * missing columns or blank cells become `undefined` / false.
 */
import type { SheetData } from './types';

export interface WorkbookSettings {
  defaultLanguage?: string;
  allowChoiceDuplicates: boolean;
  instanceName?: string;
  formTitle?: string;
  formId?: string;
  version?: string;
}

function normalizedBase(header: string): string {
  return header.trim().replace(/\s+/g, ' ').toLowerCase();
}

const BASE_BY_HEADER: Record<string, keyof WorkbookSettings | 'allow'> = {
  default_language: 'defaultLanguage',
  'default language': 'defaultLanguage',
  allow_choice_duplicates: 'allow',
  'allow choice duplicates': 'allow',
  instance_name: 'instanceName',
  'instance name': 'instanceName',
  form_title: 'formTitle',
  'form title': 'formTitle',
  form_id: 'formId',
  'form id': 'formId',
  version: 'version',
};

function firstValue(sheet: SheetData, key: string): string {
  for (const row of sheet.rows) {
    const value = (row.cells[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export function readSettings(sheet: SheetData): WorkbookSettings {
  const values: Partial<Record<keyof WorkbookSettings, string>> = {};
  for (const column of sheet.columns) {
    const field = BASE_BY_HEADER[normalizedBase(column)];
    if (!field) continue;
    const value = firstValue(sheet, column);
    if (!value) continue;
    if (field === 'allow') {
      values.allowChoiceDuplicates = value;
    } else if (field === 'defaultLanguage') {
      values.defaultLanguage = value;
    } else {
      values[field] = value;
    }
  }

  const duplicates = values.allowChoiceDuplicates?.toLowerCase();
  return {
    ...(values.defaultLanguage ? { defaultLanguage: values.defaultLanguage } : {}),
    allowChoiceDuplicates: duplicates === 'yes' || duplicates === 'true',
    ...(values.instanceName ? { instanceName: values.instanceName } : {}),
    ...(values.formTitle ? { formTitle: values.formTitle } : {}),
    ...(values.formId ? { formId: values.formId } : {}),
    ...(values.version ? { version: values.version } : {}),
  };
}
