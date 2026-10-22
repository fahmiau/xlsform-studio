/** Projection benchmark for the reference-form row count (Task 2.10). */
import { describe, test } from 'vitest';

import { buildGroupTree } from '@/core/indexes/groupTree';
import type { SheetData } from '@/core/model/types';

import { buildProjection, identityProjection, realRowIndex } from './projection';

const ROWS = 2000;
const sheet: SheetData = {
  sheetName: 'survey',
  columns: ['type', 'name', 'label'],
  rows: Array.from({ length: ROWS }, (_, index) => ({
    id: `row_${index}`,
    cells: { type: 'text', name: `q${index}`, label: `Question ${index}` },
  })),
};

describe('row projection', () => {
  test('measures projection construction and lookups', async ({ bench }) => {
    await bench('build identity projection (2,000 rows)', () => {
      identityProjection(sheet);
    }).run();

    await bench('1,000 random visible→real lookups', () => {
      const projection = identityProjection(sheet);
      let total = 0;
      for (let index = 0; index < 1000; index += 1) {
        total += realRowIndex(projection, (index * 7919) % ROWS);
      }
      if (total < 0) throw new Error('unreachable');
    }).run();
  });

  test('measures folded projection on 2,000 rows', async ({ bench }) => {
    const rows = [] as SheetData['rows'];
    const collapsed = new Set<string>();
    for (let group = 0; group < 100; group += 1) {
      const beginId = `g${group}`;
      rows.push({
        id: beginId,
        cells: { type: 'begin_group', name: `g${group}`, label: `Group ${group}` },
      });
      collapsed.add(beginId);
      for (let child = 0; child < 18; child += 1) {
        rows.push({
          id: `q${group}_${child}`,
          cells: { type: 'text', name: `q${group}_${child}`, label: `Question ${child}` },
        });
      }
      rows.push({ id: `end${group}`, cells: { type: 'end_group' } });
    }
    const grouped: SheetData = { sheetName: 'survey', columns: ['type', 'name', 'label'], rows };
    const groups = buildGroupTree(grouped);

    await bench('build folded projection (100 collapsed groups, 2,000 rows)', () => {
      buildProjection(grouped, { groups, collapsed });
    }).run();
  });
});
