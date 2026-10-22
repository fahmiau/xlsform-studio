/** Projection benchmark for the reference-form row count (Task 2.10). */
import { describe, test } from 'vitest';

import type { SheetData } from '@/core/model/types';

import { identityProjection, realRowIndex } from './projection';

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
  test('measures projection construction and lookups', ({ bench }) => {
    bench('build identity projection (2,000 rows)', () => {
      identityProjection(sheet);
    });

    bench('1,000 random visible→real lookups', () => {
      const projection = identityProjection(sheet);
      let total = 0;
      for (let index = 0; index < 1000; index += 1) {
        total += realRowIndex(projection, (index * 7919) % ROWS);
      }
      if (total < 0) throw new Error('unreachable');
    });
  });
});
