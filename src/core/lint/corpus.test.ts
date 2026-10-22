/**
 * False-positive gate (Task 4.8): curated real-world forms must produce zero
 * diagnostics. `xlsform_spec_test.xlsx` is excluded because it intentionally
 * exercises malformed spec cases.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAllIndexes } from '../indexes';
import { readSettings } from '../model/settings';
import { readWorkbook } from '../xlsx/read';
import { runLint } from './runner';

const CORPUS = join(process.cwd(), 'tests/fixtures/xlsx/real-world');
const EXCLUDED = new Set(['xlsform_spec_test.xlsx']);

describe('real-world corpus', () => {
  it('has no false positives on valid forms', async () => {
    const files = (await readdir(CORPUS)).filter(
      (file) => file.endsWith('.xlsx') && !EXCLUDED.has(file),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const parsed = await readWorkbook(new Uint8Array(await readFile(join(CORPUS, file))));
      const settings = readSettings(parsed.data.settings);
      const issues = runLint(
        parsed.data,
        buildAllIndexes(parsed.data, { defaultLanguage: settings.defaultLanguage }),
      );
      expect(
        issues.map((issue) => `${issue.ruleId} ${issue.sheet} ${issue.message}`),
        file,
      ).toEqual([]);
    }
  });
});
