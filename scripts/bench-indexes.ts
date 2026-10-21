/**
 * `pnpm bench:indexes` — `buildAllIndexes` on the reference form.
 * Target (master plan §5): ≤ 5 ms per rebuild.
 */
import { readFile } from 'node:fs/promises';

import { ensureReferenceWorkbook } from '../tests/fixtures/reference';
import { buildAllIndexes } from '../src/core/indexes';
import { readWorkbook } from '../src/core/xlsx/read';
import { measure, report } from './bench-utils';

const path = await ensureReferenceWorkbook();
const parsed = await readWorkbook(new Uint8Array(await readFile(path)));
console.log(
  `reference: ${parsed.data.survey.rows.length} survey rows, ${parsed.data.choices.rows.length} choices`,
);

const timings = await measure(
  'buildAllIndexes',
  () => {
    buildAllIndexes(parsed.data);
  },
  20,
);
report([timings]);

if (timings.median > 50) {
  console.error(`Regression: index rebuild ${timings.median.toFixed(1)} ms (limit 50 ms).`);
  process.exit(1);
}
