import { describe, expect, it } from 'vitest';

import type { SheetDiff } from '@/core/ai/diff';
import type { SheetData } from '@/core/model/types';

import { mergedSheet } from './stagingView';

function sheet(ids: string[]): SheetData {
  return {
    sheetName: 'survey',
    columns: ['type', 'name'],
    rows: ids.map((id) => ({ id, cells: { type: 'text', name: id } })),
  };
}

function diff(deleted: string[]): SheetDiff {
  return {
    rows: new Map(deleted.map((id) => [id, 'deleted' as const])),
    cells: new Set(),
  };
}

describe('mergedSheet', () => {
  it('returns the draft when nothing is deleted', () => {
    const draft = sheet(['a', 'b']);
    expect(mergedSheet(sheet(['a']), draft, null)).toBe(draft);
    expect(mergedSheet(sheet(['a', 'b']), draft, diff([]))).toBe(draft);
  });

  it('re-inserts a deleted row at its original position', () => {
    const merged = mergedSheet(sheet(['a', 'b', 'c']), sheet(['a', 'c']), diff(['b']));
    expect(merged.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a deleted first row first', () => {
    const merged = mergedSheet(sheet(['a', 'b', 'c']), sheet(['b', 'c']), diff(['a']));
    expect(merged.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a deleted last row last', () => {
    const merged = mergedSheet(sheet(['a', 'b', 'c']), sheet(['a', 'b']), diff(['c']));
    expect(merged.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps inserted draft rows in draft order', () => {
    const merged = mergedSheet(sheet(['a', 'b']), sheet(['a', 'new', 'b']), diff(['x']));
    expect(merged.rows.map((row) => row.id)).toEqual(['a', 'new', 'b']);
  });

  it('handles several deleted rows around inserted ones', () => {
    const merged = mergedSheet(
      sheet(['a', 'b', 'c', 'd']),
      sheet(['a', 'new', 'c']),
      diff(['b', 'd']),
    );
    expect(merged.rows.map((row) => row.id)).toEqual(['a', 'b', 'new', 'c', 'd']);
  });
});
