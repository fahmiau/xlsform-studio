import { CompactSelection } from '@glideapps/glide-data-grid';
import { describe, expect, it } from 'vitest';

import type { SheetData } from '@/core/model/types';

import {
  gridSelectionForCell,
  selectionBounds,
  selectionColumnKeys,
  selectionRowIndexes,
  selectionToRowIds,
} from './selection';

const sheet: SheetData = {
  sheetName: 'survey',
  columns: ['type', 'name', 'label'],
  rows: [
    { id: 'r0', cells: {} },
    { id: 'r1', cells: {} },
    { id: 'r2', cells: {} },
    { id: 'r3', cells: {} },
    { id: 'r4', cells: {} },
  ],
};

describe('grid selection helpers (Task 2.2/2.4)', () => {
  it('builds a single-cell selection', () => {
    const selection = gridSelectionForCell(2, 1);
    expect(selectionBounds(selection)).toEqual({ x: 2, y: 1, width: 1, height: 1 });
    expect(selectionRowIndexes(selection)).toEqual([1]);
    expect(selectionToRowIds(sheet, selection)).toEqual(['r1']);
  });

  it('maps a rectangular range to rows and ids', () => {
    const selection = gridSelectionForCell(1, 2, { x: 1, y: 2, width: 3, height: 2 });
    expect(selectionRowIndexes(selection)).toEqual([2, 3]);
    expect(selectionToRowIds(sheet, selection)).toEqual(['r2', 'r3']);
  });

  it('maps non-contiguous row selections before the current range', () => {
    const selection = {
      current: undefined,
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty().add(0).add(2).add(4),
    };
    expect(selectionToRowIds(sheet, selection)).toEqual(['r0', 'r2', 'r4']);
  });

  it('ignores row indexes past the end', () => {
    const selection = gridSelectionForCell(1, 3, { x: 1, y: 3, width: 1, height: 5 });
    expect(selectionToRowIds(sheet, selection)).toEqual(['r3', 'r4']);
  });

  it('excludes the gutter from copied columns', () => {
    expect(
      selectionColumnKeys(['type', 'name', 'label'], { x: 0, y: 0, width: 3, height: 1 }),
    ).toEqual({
      keys: ['type', 'name'],
      skippedGutter: true,
    });
    expect(
      selectionColumnKeys(['type', 'name', 'label'], { x: 2, y: 0, width: 2, height: 1 }),
    ).toEqual({
      keys: ['name', 'label'],
      skippedGutter: false,
    });
  });
});
