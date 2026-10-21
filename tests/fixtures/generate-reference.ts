/**
 * `pnpm fixtures` — regenerates the synthetic corpus and the 2k-row reference
 * workbook. Both are deterministic; commit only the synthetic files.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSyntheticFixtures } from './generate-fixtures';
import { referenceWorkbookPath, writeReferenceWorkbook } from './reference';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  await generateSyntheticFixtures();
  console.log(`synthetic fixtures: ${join(here, 'xlsx', 'synthetic')}`);
  const reference = await writeReferenceWorkbook(referenceWorkbookPath());
  console.log(`reference form: ${reference}`);
}

await main();
