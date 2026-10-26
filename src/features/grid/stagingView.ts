/**
 * Merged grid projection for Build Mode staging (Task 6.7).
 *
 * Deleted base rows stay visible at their original positions so the user can
 * see what will disappear. Everything else comes from the draft.
 */
import type { SheetDiff } from '@/core/ai/diff';
import type { Row, SheetData } from '@/core/model/types';

export function mergedSheet(base: SheetData, draft: SheetData, diff: SheetDiff | null): SheetData {
  if (!diff || diff.rows.size === 0) return draft;
  const deleted = new Set(
    [...diff.rows.entries()].filter(([, kind]) => kind === 'deleted').map(([rowId]) => rowId),
  );
  if (deleted.size === 0) return draft;

  const baseIndex = new Map(base.rows.map((row, index) => [row.id, index]));
  const deletedRows = base.rows.filter((row) => deleted.has(row.id));
  // Inserted draft rows have no base position; anchor them to the next
  // surviving base row so deleted rows keep their relative order.
  const anchors: number[] = new Array(draft.rows.length).fill(Number.POSITIVE_INFINITY);
  let anchor = Number.POSITIVE_INFINITY;
  for (let index = draft.rows.length - 1; index >= 0; index -= 1) {
    const basePosition = baseIndex.get(draft.rows[index]!.id);
    if (basePosition !== undefined) anchor = basePosition;
    anchors[index] = anchor;
  }

  const merged: Row[] = [];
  let cursor = 0;

  draft.rows.forEach((row, index) => {
    const position = anchors[index] ?? Number.POSITIVE_INFINITY;
    while (
      cursor < deletedRows.length &&
      (baseIndex.get(deletedRows[cursor]!.id) ?? 0) < position
    ) {
      merged.push(deletedRows[cursor]!);
      cursor += 1;
    }
    merged.push(row);
  });
  merged.push(...deletedRows.slice(cursor));
  return { ...draft, rows: merged };
}
