/**
 * Linter types (Task 4.7). Rules are pure functions over document data plus
 * derived indexes, so they can move into a Web Worker unchanged (AD-1/AD-12).
 */
import type { AllIndexes } from '../indexes';
import type { WorkbookSettings } from '../model/settings';
import type { ColumnKey, ManagedSheetName, Row, RowId, WorkbookData } from '../model/types';
import type { Token } from '../xpath/tokenize';

export type LintSeverity = 'error' | 'warning';

export interface LintCell {
  row: Row;
  rowIndex: number;
  column: ColumnKey;
  text: string;
}

export interface DiagnosticRange {
  from: number;
  to: number;
}

export interface DiagnosticIssue {
  ruleId: string;
  severity: LintSeverity;
  sheet: ManagedSheetName;
  rowId: RowId;
  column?: ColumnKey;
  /** Range inside the cell's string value. */
  range?: DiagnosticRange;
  message: string;
  /** Rule-specific payload (related rows, list names, …). */
  data?: Record<string, unknown>;
}

export interface TokenCache {
  get(source: string): readonly Token[];
}

export interface LintContext {
  data: WorkbookData;
  indexes: AllIndexes;
  settings: WorkbookSettings;
  tokens: TokenCache;
  /** Survey cells containing `$`, scanned once and shared by XLS-004/005/011. */
  varRefCells: readonly LintCell[];
}

export interface LintRule {
  id: string;
  severity: LintSeverity;
  run(ctx: LintContext): DiagnosticIssue[];
}
