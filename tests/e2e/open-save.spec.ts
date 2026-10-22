/**
 * Smoke test for the Stage 1 file workflow with mocked Tauri IPC.
 * A mock `__TAURI_INTERNALS__.invoke` serves a real fixture and captures saves,
 * so no native window is involved.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');

test('open a fixture and save it back through the mocked IPC bridge', async ({ page }) => {
  const base64 = (await readFile(FIXTURE)).toString('base64');

  await page.addInitScript(
    (payload) => {
      const internals = {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main', windowLabel: 'main' },
        },
        invoke: async (command: string, args: Record<string, unknown>) => {
          switch (command) {
            case 'app_info':
              return { version: '0.1.0', platform: 'windows', arch: 'x86_64' };
            case 'plugin:dialog|open':
              return 'C:/forms/01-basic.xlsx';
            case 'plugin:dialog|save':
              return 'C:/forms/saved.xlsx';
            case 'read_workbook':
              return payload.base64;
            case 'save_workbook':
              (window as unknown as { __savedWorkbook?: unknown }).__savedWorkbook = {
                path: args.path,
                base64: args.base64,
              };
              return null;
            case 'plugin:event|listen':
              return 1;
            case 'plugin:event|unlisten':
            case 'plugin:window|set_title':
              return null;
            default:
              return null;
          }
        },
        transformCallback: (callback: (...args: unknown[]) => void) => {
          const id = Math.floor(Math.random() * 1_000_000_000);
          (window as unknown as Record<string, unknown>)[`_callback_${id}`] = callback;
          return id;
        },
        unregisterCallback: () => undefined,
      };
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = internals;
    },
    { base64 },
  );

  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (0)');
  await expect(page.getByTestId('document-title')).toContainText('Untitled form');

  await page.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByTestId('document-title')).toContainText('01-basic.xlsx');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
  await expect(page.getByTestId('sheet-tab-choices')).toHaveText('choices (1 lists)');
  await expect(page.getByTestId('sheet-tab-settings')).toHaveText('settings');
  await expect(page.getByTestId('sheet-grid-survey')).toBeVisible();

  await page.getByRole('button', { name: 'Save As' }).click();

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __savedWorkbook?: { path: string } }).__savedWorkbook?.path ??
          null,
      ),
    )
    .toBe('C:/forms/saved.xlsx');

  const saved = await page.evaluate(
    () =>
      (window as unknown as { __savedWorkbook?: { path: string; base64: string } }).__savedWorkbook,
  );
  expect(saved?.base64).toBeTruthy();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(saved?.base64 ?? '', 'base64') as never);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['survey', 'choices', 'settings']);
  const survey = workbook.getWorksheet('survey');
  expect(survey?.getRow(2).getCell(2).text).toBe('respondent_name');
  expect(survey?.getRow(2).getCell(3).text).toBe('Respondent name');
  const choices = workbook.getWorksheet('choices');
  expect(choices?.getRow(3).getCell(2).text).toBe('no');

  // The document is clean after a successful save.
  await expect(page.getByTestId('document-title')).not.toContainText('*');
});
