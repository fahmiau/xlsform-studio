/**
 * Variable index for autocomplete and refactoring (PRD §3, Task 1.7).
 * Pure functions over `SheetData`.
 */
import { parseType } from '../model/parseType';
import { resolveColumn } from '../model/columns';
import type { RowId, SheetData } from '../model/types';

export interface VariableMetadata {
  rowId: RowId;
  rowIndex: number;
  name: string;
  /** Base question type, e.g. `select_one`, `integer`, `begin_group`. */
  questionType: string;
  listName?: string;
  primaryLabel: string;
  /** Names of the enclosing groups/repeats (outermost first). */
  groupPath: string[];
}

export interface VariableMap {
  variables: Record<string, VariableMetadata>;
  /** Exact duplicate names and the rows that share them (XLS-002). */
  duplicates: Record<string, RowId[]>;
  /** Variables in document order. */
  order: VariableMetadata[];
}

export interface VariableOptions {
  /** Default language name or code, e.g. `English` or `en`. */
  defaultLanguage?: string;
}

function labelColumn(sheet: SheetData, options: VariableOptions): string | undefined {
  const labelColumns = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
  if (labelColumns.length === 0) return undefined;

  const preferred = options.defaultLanguage?.trim().toLowerCase();
  if (preferred) {
    const localized = labelColumns.find((column) => {
      const language = resolveColumn(column).language;
      if (!language) return false;
      return (
        language.code?.toLowerCase() === preferred || language.name.toLowerCase() === preferred
      );
    });
    if (localized) return localized;
  }

  const plain = labelColumns.find((column) => !resolveColumn(column).language);
  return plain ?? labelColumns[0];
}

export function buildVariableMap(sheet: SheetData, options: VariableOptions = {}): VariableMap {
  const labelKey = labelColumn(sheet, options);
  const variables: Record<string, VariableMetadata> = {};
  const duplicates: Record<string, RowId[]> = {};
  const order: VariableMetadata[] = [];
  const groupStack: string[] = [];

  sheet.rows.forEach((row, rowIndex) => {
    const type = parseType(row.cells.type ?? '');
    const base = type.base;
    const name = (row.cells.name ?? '').trim();

    if (base === 'end_group' || base === 'end_repeat') {
      groupStack.pop();
      return;
    }

    if (!name) return;

    const metadata: VariableMetadata = {
      rowId: row.id,
      rowIndex,
      name,
      questionType: base,
      primaryLabel: labelKey ? (row.cells[labelKey] ?? '') : '',
      groupPath: [...groupStack],
    };
    if (type.listName) metadata.listName = type.listName;

    if (variables[name]) {
      duplicates[name] = [...(duplicates[name] ?? [variables[name].rowId]), row.id];
    } else {
      variables[name] = metadata;
    }
    order.push(metadata);

    if (base === 'begin_group' || base === 'begin_repeat') {
      groupStack.push(name);
    }
  });

  return { variables, duplicates, order };
}
