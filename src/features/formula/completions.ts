/**
 * CodeMirror completion source (Task 4.5). Pure decisions live in
 * `core/xpath/context`; this module only turns them into Completion items.
 */
import {
  pickedCompletion,
  snippet,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import type { ChoicesIndex, VariableMap } from '@/core/indexes';
import { findColumnKey } from '@/core/indexes/columns';
import type { AllIndexes } from '@/core/indexes';
import { resolveColumn } from '@/core/model/columns';
import { defaultLabelColumn } from '@/core/model/labelColumn';
import { readSettings } from '@/core/model/settings';
import type { ManagedSheetName, RowId, WorkbookData } from '@/core/model/types';
import { analyzeContext } from '@/core/xpath/context';
import { XPATH_FUNCTIONS } from '@/core/xpath/functions';
import { filterByFuzzy } from '@/features/grid/editors/fuzzy';

import { functionCompletionInfo, variableCompletionInfo } from './completionRender';

export interface CompletionData {
  variableMap: VariableMap;
  choicesByList: ChoicesIndex['byList'];
  choiceNameKey: string;
  choiceLabelKey?: string;
  /** Active survey row index, for forward-reference warnings. */
  rowIndex?: number;
  currentRowName?: string;
  /** Resolved base of the active column (relevant/constraint exclude self). */
  columnBase?: string;
}

const SELF_REFERENCE_EXCLUDED = new Set(['relevant', 'constraint']);

export interface CompletionCell {
  sheet: ManagedSheetName;
  rowId: RowId;
  column: string;
}

/** Snapshot the live indexes for the active grid cell. */
export function completionDataFor(
  data: WorkbookData,
  indexes: AllIndexes,
  cell: CompletionCell,
): CompletionData {
  const sheet = data[cell.sheet];
  const row = sheet.rows.find((candidate) => candidate.id === cell.rowId);
  const rowIndex = indexes.rowIndexes[cell.sheet].get(cell.rowId);
  const nameKey = findColumnKey(sheet, 'name');
  const labelKey = defaultLabelColumn(data.choices, readSettings(data.settings).defaultLanguage);
  return {
    variableMap: indexes.variables,
    choicesByList: indexes.choices.byList,
    choiceNameKey: findColumnKey(data.choices, 'name') ?? 'name',
    ...(labelKey ? { choiceLabelKey: labelKey } : {}),
    ...(rowIndex !== undefined ? { rowIndex } : {}),
    ...(row && nameKey && row.cells[nameKey] ? { currentRowName: row.cells[nameKey] } : {}),
    columnBase: resolveColumn(cell.column).base,
  };
}

function variableOptions(data: CompletionData, prefix: string): Completion[] {
  const seen = new Set<string>();
  const candidates = data.variableMap.order.filter((metadata) => {
    if (seen.has(metadata.name)) return false;
    seen.add(metadata.name);
    return !(
      data.currentRowName === metadata.name &&
      data.columnBase !== undefined &&
      SELF_REFERENCE_EXCLUDED.has(data.columnBase)
    );
  });
  return filterByFuzzy(
    prefix,
    candidates,
    (metadata) => `${metadata.name} ${metadata.primaryLabel}`,
  ).map((metadata) => {
    const forward = data.rowIndex !== undefined && metadata.rowIndex > data.rowIndex;
    return {
      label: metadata.name,
      detail: `${metadata.questionType}${metadata.primaryLabel ? ` · ${metadata.primaryLabel}` : ''}${forward ? '  ⚠ forward' : ''}`,
      info: () => variableCompletionInfo(metadata, forward),
      type: 'variable',
      ...(forward ? { boost: -1 } : {}),
    };
  });
}

function choiceOptions(data: CompletionData, listName: string, prefix: string): Completion[] {
  const rows = data.choicesByList[listName] ?? [];
  const candidates = rows
    .map((row) => ({
      name: (row.cells[data.choiceNameKey] ?? '').trim(),
      label: data.choiceLabelKey ? (row.cells[data.choiceLabelKey] ?? '') : '',
    }))
    .filter((entry) => entry.name !== '');
  return filterByFuzzy(prefix, candidates, (entry) => `${entry.name} ${entry.label}`).map(
    (entry) => ({
      label: entry.name,
      detail: entry.label || undefined,
      type: 'enum',
    }),
  );
}

function functionOptions(prefix: string): Completion[] {
  return filterByFuzzy(
    prefix,
    XPATH_FUNCTIONS,
    (fn) => `${fn.name} ${fn.signature} ${fn.description}`,
  ).map((fn) => ({
    label: fn.name,
    detail: fn.signature,
    info: () => functionCompletionInfo(fn),
    type: 'function',
    apply: snippet(fn.snippet),
  }));
}

function applyVariableInsert(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  braced: boolean,
): void {
  const doc = view.state.doc.toString();
  const hasClosingBrace = to < doc.length && doc[to] === '}';
  const text = braced
    ? hasClosingBrace
      ? completion.label
      : `${completion.label}}`
    : `{${completion.label}}`;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    annotations: [pickedCompletion.of(completion)],
    userEvent: 'input.complete',
  });
}

/**
 * Build a CodeMirror completion source over a live data snapshot.
 * `getData` is called at completion time so indexes never go stale.
 */
export function makeCompletionSource(getData: () => CompletionData): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const data = getData();
    const source = context.state.doc.toString();
    const analysis = analyzeContext(source, context.pos, { variableMap: data.variableMap });

    if (analysis.kind === 'variable') {
      const options = variableOptions(data, analysis.prefix).map((option) => ({
        ...option,
        apply: (view: EditorView, completion: Completion, from: number, to: number) =>
          applyVariableInsert(view, completion, from, to, analysis.braced),
      }));
      return { from: analysis.from, to: analysis.to, options, filter: false };
    }

    if (analysis.kind === 'choiceValue') {
      const options = choiceOptions(data, analysis.listName, analysis.prefix);
      if (options.length === 0) return null;
      return { from: analysis.from, to: analysis.to, options, filter: false };
    }

    if (analysis.kind === 'function') {
      return {
        from: analysis.from,
        to: analysis.to,
        options: functionOptions(analysis.prefix),
        filter: false,
      };
    }

    if (context.explicit) {
      return {
        from: context.pos,
        to: context.pos,
        options: [...variableOptions(data, ''), ...functionOptions('')],
        filter: false,
      };
    }
    return null;
  };
}
