/**
 * `pnpm bench:lint` — full lint run on the reference form.
 * Gate (Task 4.9 / AD-12): median ≤ 15 ms on the main thread.
 * `LINT_BENCH_LIMIT_MS` is an explicit CI-only override for noisy shared
 * runners; the app target itself stays 15 ms (docs/perf/stage-4.md).
 */
import { buildAllIndexes } from '../src/core/indexes';
import { runLint } from '../src/core/lint';
import { buildReferenceWorkbookData } from '../tests/fixtures/reference-workbook';
import { measure, report } from './bench-utils';

const data = buildReferenceWorkbookData();
const indexes = buildAllIndexes(data, { defaultLanguage: 'English (en)' });
const diagnostics = runLint(data, indexes);
console.log(
  `reference: ${data.survey.rows.length} survey rows, ${data.choices.rows.length} choices, ${diagnostics.length} diagnostics`,
);

// Let the JIT settle before sampling; the gate measures steady-state latency.
for (let warmup = 0; warmup < 5; warmup += 1) runLint(data, indexes);

const timings = await measure(
  'runLint (11 rules)',
  () => {
    runLint(data, indexes);
  },
  20,
);
report([timings]);

const rawLimit = process.env.LINT_BENCH_LIMIT_MS ?? '15';
const limit = Number(rawLimit);
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid LINT_BENCH_LIMIT_MS: ${rawLimit}`);
  process.exit(1);
}

if (timings.median > limit) {
  console.error(`Regression: lint ${timings.median.toFixed(1)} ms (limit ${limit} ms).`);
  process.exit(1);
}
