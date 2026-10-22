/**
 * Keyboard-driven grid smoke tests (Tasks 2.2–2.8) with mocked Tauri IPC.
 * The grid is a canvas, so assertions use the formula bar and sheet-tab counts.
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
  await page.goto('/');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
}

test('edit a grid cell with the keyboard and undo it', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');

  await expect(page.getByTestId('formula-bar-input')).toHaveValue('integer');
  const formula = page.getByTestId('formula-bar-input');
  await formula.fill('note');
  await formula.press('Enter');

  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');
  await expect(formula).toHaveValue('note');

  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('integer');
});

test('insert rows with the keyboard and undo/redo them', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('formula-bar-column')).not.toHaveText('[Column: —]');

  await page.keyboard.press('Control+i');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');

  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');
});

test('edit the settings form and undo it', async ({ page }) => {
  await mockTauri(page);
  await page.goto('/');
  await page.getByTestId('sheet-tab-settings').click();
  const input = page.getByTestId('setting-form_title');
  await input.fill('Edited title');
  await input.blur();
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');

  await page.keyboard.press('Control+z');
  await expect(input).toHaveValue('Untitled form');
});
