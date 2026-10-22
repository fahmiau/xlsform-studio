/**
 * Variable index for autocomplete and refactoring (PRD §3, Task 1.7).
 * Pure functions over `SheetData`.
 */
import { parseType } from '../model/parseType';
import { defaultLabelColumn } from '../model/labelColumn';
import type { RowId, SheetData } from '../model/types';
import { columnKey } from './columns';

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
  return defaultLabelColumn(sheet, options.defaultLanguage);
}

export function buildVariableMap(sheet: SheetData, options: VariableOptions = {}): VariableMap {
  const labelKey = labelColumn(sheet, options);
  const typeKey = columnKey(sheet, 'type');
  const nameKey = columnKey(sheet, 'name');
  const variables: Record<string, VariableMetadata> = {};
  const duplicates: Record<string, RowId[]> = {};
  const order: VariableMetadata[] = [];
  const groupStack: Array<{ name: string; kind: 'group' | 'repeat' }> = [];

  sheet.rows.forEach((row, rowIndex) => {
    const type = parseType(row.cells[typeKey] ?? '');
    const base = type.base;
    const name = (row.cells[nameKey] ?? '').trim();

    if (base === 'end_group' || base === 'end_repeat') {
      // Match the open kind like `groupTree` does; a mismatched end tag is an
      // orphan, not a reason to pop an unrelated group off the stack.
      const expected = base === 'end_repeat' ? 'repeat' : 'group';
      if (groupStack[groupStack.length - 1]?.kind === expected) groupStack.pop();
      return;
    }

    if (!name) return;

    const metadata: VariableMetadata = {
      rowId: row.id,
      rowIndex,
      name,
      questionType: base,
      primaryLabel: labelKey ? (row.cells[labelKey] ?? '') : '',
      groupPath: groupStack.map((entry) => entry.name),
    };
    if (type.listName) metadata.listName = type.listName;

    if (variables[name]) {
      duplicates[name] = [...(duplicates[name] ?? [variables[name].rowId]), row.id];
    } else {
      variables[name] = metadata;
    }
    order.push(metadata);

    if (base === 'begin_group' || base === 'begin_repeat') {
      groupStack.push({ name, kind: base === 'begin_repeat' ? 'repeat' : 'group' });
    }
  });

  return { variables, duplicates, order };
}
