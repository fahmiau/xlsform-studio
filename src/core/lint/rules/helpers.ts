/** Shared helpers for lint rules. */
import { findColumnKey } from '../../indexes/columns';
import type { AllIndexes } from '../../indexes';
import type { ColumnBase } from '../../model/columns';
import type { ColumnKey, Row, SheetData } from '../../model/types';

export function columnFor(sheet: SheetData, base: ColumnBase): ColumnKey | undefined {
  return findColumnKey(sheet, base);
}

export function cell(row: Row | undefined, key: ColumnKey | undefined): string {
  if (!row || !key) return '';
  return row.cells[key] ?? '';
}

export function rowNumber(rowIndex: number): number {
  return rowIndex + 1;
}

export function definedVariableNames(indexes: AllIndexes): Set<string> {
  return new Set([
    ...Object.keys(indexes.variables.variables),
    ...Object.keys(indexes.variables.duplicates),
  ]);
}

export interface SelectVariable {
  listName: string;
}

/** Resolve a `${name}` to a select question with a list name. */
export function selectVariable(indexes: AllIndexes, name: string): SelectVariable | undefined {
  const metadata = indexes.variables.variables[name];
  if (!metadata || !metadata.listName) return undefined;
  if (
    metadata.questionType !== 'select_one' &&
    metadata.questionType !== 'select_multiple' &&
    metadata.questionType !== 'rank'
  ) {
    return undefined;
  }
  return { listName: metadata.listName };
}
