/**
 * `pnpm bench:xlsx` — reference-form timings for the reader and writer.
 *
 * Targets (master plan §5): open/save ≤ 1 s. The stage plan's 500 ms goal is
 * not met by exceljs on the 80k-cell reference form; ADR 0001 tracks the
 * follow-up. Exits non-zero only on a gross regression/hang.
 */
import { ensureReferenceWorkbook } from '../tests/fixtures/reference';
import { readFile } from 'node:fs/promises';

import { readWorkbook } from '../src/core/xlsx/read';
import { writeWorkbook } from '../src/core/xlsx/write';
import { measure, report } from './bench-utils';

const path = await ensureReferenceWorkbook();
const bytes = new Uint8Array(await readFile(path));
console.log(`reference workbook: ${path} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);

const read = await measure('xlsx read', async () => {
  await readWorkbook(bytes);
});

let parsed: Awaited<ReturnType<typeof readWorkbook>> | undefined;
const write = await measure('read + write (in place)', async () => {
  parsed = await readWorkbook(bytes);
  await writeWorkbook(parsed.data, { sourceHandle: parsed.sourceHandle });
});

report([read, write]);

const READ_LIMIT = 2_500;
const WRITE_LIMIT = 3_500;
if (read.median > READ_LIMIT || write.median > WRITE_LIMIT) {
  console.error(
    `Regression: read ${read.median.toFixed(0)} ms (limit ${READ_LIMIT}) / write ${write.median.toFixed(
      0,
    )} ms (limit ${WRITE_LIMIT}).`,
  );
  process.exit(1);
}
