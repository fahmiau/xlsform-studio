import { describe, expect, it } from 'vitest';

import { addColumn, removeColumn } from './columns';
import { getCell, setCells } from './cells';
import { createEmptyWorkbook, createRow } from '../model/factory';
import { deleteRows, duplicateRows, insertRows } from './rows';

function workbookWithRows() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'text', name: 'q1', label: 'One' }),
    createRow({ type: 'integer', name: 'q2', label: 'Two' }),
  );
  return data;
}

describe('setCells', () => {
  it('applies a batch and returns new data without mutating the input', () => {
    const data = workbookWithRows();
    const rowId = data.survey.rows[0]!.id;
    const next = setCells(data, 'survey', [
      { rowId, column: 'label', value: 'One (edited)' },
      { rowId, column: 'hint', value: 'A hint' },
    ]);
    expect(getCell(next, 'survey', rowId, 'label')).toBe('One (edited)');
    expect(getCell(data, 'survey', rowId, 'label')).toBe('One');
    expect(next).not.toBe(data);
  });

  it('removes empty values instead of storing empty strings', () => {
    const data = workbookWithRows();
    const rowId = data.survey.rows[0]!.id;
    const next = setCells(data, 'survey', [{ rowId, column: 'label', value: '' }]);
    expect(next.survey.rows[0]?.cells.label).toBeUndefined();
  });

  it('ignores unknown row ids but rejects unknown columns', () => {
    const data = workbookWithRows();
    const next = setCells(data, 'survey', [{ rowId: 'missing', column: 'label', value: 'x' }]);
    expect(next).toBe(data);
    expect(() =>
      setCells(data, 'survey', [{ rowId: data.survey.rows[0]!.id, column: 'nope', value: 'x' }]),
    ).toThrow(/does not exist/);
  });
});

describe('insertRows', () => {
  it('inserts at an index, clamps out-of-range indexes, and assigns new ids', () => {
    const data = workbookWithRows();
    const next = insertRows(data, 'survey', 1, [{ cells: { type: 'note', label: 'Inserted' } }]);
    expect(next.survey.rows.map((row) => row.cells.name)).toEqual(['q1', undefined, 'q2']);
    expect(next.survey.rows[1]?.id).toMatch(/^[0-9a-z]{12}$/);
    expect(data.survey.rows).toHaveLength(2);

    expect(insertRows(data, 'survey', -5, [{ cells: {} }]).survey.rows[0]?.cells).toEqual({});
    expect(insertRows(data, 'survey', 99, [{ cells: {} }]).survey.rows).toHaveLength(3);
  });

  it('reuses provided row ids when they are free (restores)', () => {
    const data = workbookWithRows();
    const restored = insertRows(data, 'survey', 0, [{ id: 'row_restored', cells: { name: 'x' } }]);
    expect(restored.survey.rows[0]?.id).toBe('row_restored');
  });

  it('does nothing for an empty insert list', () => {
    const data = workbookWithRows();
    const next = insertRows(data, 'survey', 1, []);
    expect(next).toBe(data);
  });
});

describe('deleteRows', () => {
  it('removes selected rows only', () => {
    const data = workbookWithRows();
    const next = deleteRows(data, 'survey', [data.survey.rows[1]!.id]);
    expect(next.survey.rows.map((row) => row.cells.name)).toEqual(['q1']);
  });
});

describe('duplicateRows', () => {
  it('duplicates each selected row after itself with fresh ids', () => {
    const data = workbookWithRows();
    const next = duplicateRows(data, 'survey', [data.survey.rows[0]!.id]);
    expect(next.survey.rows.map((row) => row.cells.name)).toEqual(['q1', 'q1', 'q2']);
    expect(next.survey.rows[1]?.id).not.toBe(next.survey.rows[0]?.id);
  });
});

describe('columns', () => {
  it('adds and removes columns with their values', () => {
    const data = workbookWithRows();
    const withColumn = addColumn(data, 'survey', 'custom_x');
    expect(withColumn.survey.columns.at(-1)).toBe('custom_x');

    const rowId = withColumn.survey.rows[0]!.id;
    const withValue = setCells(withColumn, 'survey', [{ rowId, column: 'custom_x', value: 'v' }]);
    const removed = removeColumn(withValue, 'survey', 'custom_x');
    expect(removed.survey.columns).not.toContain('custom_x');
    expect(removed.survey.rows[0]?.cells.custom_x).toBeUndefined();
  });

  it('is a no-op for duplicate adds and missing removals', () => {
    const data = workbookWithRows();
    expect(addColumn(data, 'survey', 'type')).toBe(data);
    expect(removeColumn(data, 'survey', 'nope')).toBe(data);
  });
});
