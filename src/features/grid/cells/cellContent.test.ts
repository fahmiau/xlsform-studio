import { GridCellKind } from '@glideapps/glide-data-grid';
import { describe, expect, it } from 'vitest';

import { cellValue, editValueText, textCell } from './cellContent';

describe('grid cell builders (Task 2.2)', () => {
  it('builds an editable text cell', () => {
    expect(textCell('hello')).toMatchObject({
      kind: GridCellKind.Text,
      data: 'hello',
      displayData: 'hello',
      allowOverlay: true,
      readonly: false,
    });
  });

  it('makes read-only cells faded', () => {
    expect(textCell('x', { readonly: true, faded: true })).toMatchObject({
      allowOverlay: false,
      readonly: true,
      style: 'faded',
    });
  });

  it('supports right alignment', () => {
    expect(textCell('1', { align: 'right' })).toMatchObject({ contentAlign: 'right' });
  });

  it('reads cells with an empty fallback', () => {
    const sheet = {
      sheetName: 'survey',
      columns: ['label'],
      rows: [{ id: 'r', cells: { label: 'A' } }],
    };
    expect(cellValue(sheet, 0, 'label')).toBe('A');
    expect(cellValue(sheet, 0, 'hint')).toBe('');
    expect(cellValue(sheet, 5, 'label')).toBe('');
  });

  it('decodes edited cells back to strings', () => {
    expect(
      editValueText({ kind: GridCellKind.Text, data: 'a', displayData: 'a', allowOverlay: true }),
    ).toBe('a');
    expect(
      editValueText({ kind: GridCellKind.Number, data: 12, displayData: '12', allowOverlay: true }),
    ).toBe('12');
    expect(editValueText({ kind: GridCellKind.Boolean, data: true, allowOverlay: false })).toBe(
      'TRUE',
    );
    expect(editValueText({ kind: GridCellKind.Boolean, data: false, allowOverlay: false })).toBe(
      'FALSE',
    );
    expect(editValueText({ kind: GridCellKind.Boolean, data: null, allowOverlay: false })).toBe('');
  });
});
