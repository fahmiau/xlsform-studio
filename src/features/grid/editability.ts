/** Cell editability rules (Task 2.3, PRD §4.1). */
import { resolveColumn } from '@/core/model/columns';
import type { ColumnBase, ResolvedColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import type { ColumnKey } from '@/core/model/types';

export type StructuralRowKind = 'begin_group' | 'begin_repeat' | 'end_group' | 'end_repeat' | null;

export function structuralRowKind(typeValue: string): StructuralRowKind {
  const base = parseType(typeValue).base;
  if (
    base === 'begin_group' ||
    base === 'begin_repeat' ||
    base === 'end_group' ||
    base === 'end_repeat'
  ) {
    return base;
  }
  return null;
}

/** Columns disabled on `end_group` / `end_repeat` rows (PRD §4.1). */
export const END_ROW_READ_ONLY: readonly ColumnBase[] = [
  'relevant',
  'constraint',
  'calculation',
  'required',
];

export function isCellEditable(typeValue: string, column: ColumnKey): boolean {
  const kind = structuralRowKind(typeValue);
  if (kind !== 'end_group' && kind !== 'end_repeat') return true;
  const resolved: ResolvedColumn = resolveColumn(column);
  return !END_ROW_READ_ONLY.includes(resolved.base);
}

/** Structural rows get the tint + badge styling. */
export function rowTintKind(typeValue: string): 'begin' | 'end' | null {
  const kind = structuralRowKind(typeValue);
  if (kind === 'begin_group' || kind === 'begin_repeat') return 'begin';
  if (kind === 'end_group' || kind === 'end_repeat') return 'end';
  return null;
}
