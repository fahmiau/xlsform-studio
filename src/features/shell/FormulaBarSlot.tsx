/** Formula bar slot (Tasks 2.1/2.2): shows and edits the active cell. */
import { useState } from 'react';

import { resolveColumn } from '@/core/model/columns';
import { findColumnKey } from '@/core/indexes/columns';
import { setCells } from '@/core/ops/cells';
import { isCellEditable } from '@/features/grid/editability';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export function FormulaBarSlot() {
  const activeCell = useUiStore((state) => state.activeCell);
  const data = useWorkbookStore((state) => state.data);

  const sheet = activeCell ? data[activeCell.sheet] : null;
  const row = activeCell
    ? sheet?.rows.find((candidate) => candidate.id === activeCell.rowId)
    : null;
  const value = activeCell && row ? (row.cells[activeCell.column] ?? '') : '';
  const typeKey = sheet ? (findColumnKey(sheet, 'type') ?? 'type') : 'type';
  const editable = activeCell
    ? isCellEditable(row?.cells[typeKey] ?? '', activeCell.column)
    : false;

  const commit = (draft: string) => {
    if (!activeCell || !editable || draft === value) return;
    useWorkbookStore
      .getState()
      .apply(
        `Edit ${resolveColumn(activeCell.column).canonical}`,
        (current) =>
          setCells(current, activeCell.sheet, [
            { rowId: activeCell.rowId, column: activeCell.column, value: draft },
          ]),
        { sheet: activeCell.sheet, rowIds: [activeCell.rowId] },
      );
  };

  return (
    <div className="flex items-center gap-2 border-b px-3 py-1" data-testid="formula-bar">
      <span className="text-muted-foreground font-mono text-xs italic">fx</span>
      <FormulaInput
        key={`${activeCell?.rowId ?? ''}:${activeCell?.column ?? ''}:${value}`}
        value={value}
        enabled={Boolean(activeCell)}
        editable={editable}
        onCommit={commit}
      />
      <span className="text-muted-foreground shrink-0 text-xs" data-testid="formula-bar-column">
        {activeCell ? `[Column: ${resolveColumn(activeCell.column).canonical}]` : '[Column: —]'}
      </span>
    </div>
  );
}

function FormulaInput({
  value,
  enabled,
  editable,
  onCommit,
}: {
  value: string;
  enabled: boolean;
  editable: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      className="border-input bg-background focus-visible:ring-ring min-w-0 flex-1 rounded border px-2 py-0.5 font-mono text-xs focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
      data-testid="formula-bar-input"
      value={enabled ? draft : ''}
      disabled={!enabled || !editable}
      placeholder={enabled ? '' : 'Select a cell'}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft);
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
