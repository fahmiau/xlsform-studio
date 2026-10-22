import { describe, test } from 'vitest';

import { buildAllIndexes } from '@/core/indexes';
import { runLint } from '@/core/lint';
import { buildReferenceWorkbookData } from '../../../tests/fixtures/reference-workbook';

const data = buildReferenceWorkbookData();
const indexes = buildAllIndexes(data, { defaultLanguage: 'English (en)' });

describe('lint on the reference form', () => {
  test('measures runLint with all 11 rules', async ({ bench }) => {
    await bench('runLint — all 11 rules', () => {
      runLint(data, indexes);
    }).run();
  });
});
