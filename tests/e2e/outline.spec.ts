/**
 * Choices-sheet Outline (C3) with mocked Tauri IPC. The grid is a canvas, so
 * the jump is asserted through the formula bar.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');

async function mockTauri(page: Page, fixturePath = FIXTURE, fileName = '01-basic.xlsx') {
  const base64 = (await readFile(fixturePath)).toString('base64');

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
              return `C:/forms/${payload.fileName}`;
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
    { base64, fileName },
  );
}

async function openFixture(page: Page) {
  await mockTauri(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
}

test('choices outline lists list names, filters them, and jumps to the first choice', async ({
  page,
}) => {
  await openFixture(page);

  await page.getByTestId('sheet-tab-choices').click();
  await expect(page.getByTestId('sheet-tab-choices')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('outline-tree')).toHaveAttribute('aria-label', 'Choice lists');

  const list = page.getByTestId('outline-choice-list-yes_no');
  await expect(list).toBeVisible();
  await expect(list).toContainText('yes_no');
  await expect(list).toContainText('2');
  await expect(list).toHaveAccessibleName('yes_no, 2 choices');
  // Survey rows must not leak into the choices outline.
  await expect(page.getByTestId('outline-panel')).not.toContainText('respondent_name');

  const search = page.getByTestId('outline-search');
  await expect(search).toHaveAccessibleName('Search choice lists');
  await search.fill('zzz');
  await expect(page.getByText('No matching lists.')).toBeVisible();
  await search.fill('');
  await expect(list).toBeVisible();

  await page.getByTestId('outline-tree').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('sheet-tab-choices')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('yes');

  await page.getByTestId('sheet-tab-survey').click();
  await expect(page.getByTestId('outline-tree')).toHaveAttribute('aria-label', 'Survey outline');
  await expect(page.getByTestId('outline-panel')).toContainText('respondent_name');

  await page.getByTestId('sheet-tab-choices').click();
  await page.getByTestId('outline-choice-list-yes_no').click();
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('yes');
});
