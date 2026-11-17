/**
 * Stage 5 smoke: rename refactoring with one-step undo, language views that
 * never touch the document, Add Language, and the Ctrl+K command palette.
 * The grid is canvas-based, so assertions use the formula bar and panels.
 */
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const BASIC = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');
const LOCALIZED = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/04-localized.xlsx');

/** Two questions, one of them referencing the other, so a rename has work to do. */
async function referenceFixtureBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const survey = workbook.addWorksheet('survey');
  survey.addRow(['type', 'name', 'label', 'relevant']);
  survey.addRow(['text', 'q1', 'Question one', '']);
  survey.addRow(['integer', 'q2', 'Question two', '${q1} > 0']);
  const choices = workbook.addWorksheet('choices');
  choices.addRow(['list_name', 'name', 'label']);
  const settings = workbook.addWorksheet('settings');
  settings.addRow(['form_title', 'form_id']);
  settings.addRow(['Rename fixture', 'rename_fixture']);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

async function mockTauri(page: Page, base64: string, fileName: string) {
  await page.addInitScript(
    (payload) => {
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main', windowLabel: 'main' },
        },
        invoke: async (command: string) => {
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
              return null;
            case 'plugin:store|load':
              return 1;
            case 'plugin:store|get':
              return [null, false];
            case 'plugin:store|set':
            case 'plugin:store|save':
            case 'plugin:event|listen':
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
    },
    { base64, fileName },
  );
}

async function openFixture(page: Page, base64: string, fileName: string, rows: number) {
  await mockTauri(page, base64, fileName);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText(`survey (${rows})`);
}

function surveyCanvas(page: Page) {
  return page.getByTestId('sheet-grid-survey').locator('canvas').first();
}

test('renaming a variable rewrites references in one undo step', async ({ page }) => {
  await openFixture(page, await referenceFixtureBase64(), 'rename-fixture.xlsx', 2);

  const canvas = surveyCanvas(page);
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  const formula = page.getByTestId('formula-bar-input');
  await expect(formula).toHaveValue('q1');
  await formula.fill('q1_renamed');
  await formula.press('Enter');

  await expect(page.getByText('Renamed q1 → q1_renamed')).toBeVisible();
  await expect(page.getByText('Updated 1 reference across formulas and text.')).toBeVisible();

  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: relevant]');
  await expect(page.getByTestId('formula-bar-editor')).toContainText('${q1_renamed} > 0');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(formula).toHaveValue('q1');

  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: relevant]');
  await expect(page.getByTestId('formula-bar-editor')).toContainText('${q1} > 0');
});

test('switching the language view never dirties the document', async ({ page }) => {
  await openFixture(page, (await readFile(LOCALIZED)).toString('base64'), '04-localized.xlsx', 2);

  const title = page.getByTestId('document-title');
  const summary = page.getByTestId('language-view-summary');
  await expect(title).toContainText('04-localized.xlsx');
  await expect(title).not.toContainText('*');
  await expect(summary).toHaveText('All');

  await page.getByTestId('language-selector').click();
  await page.getByTestId('language-item-English (en)').click();
  await expect(summary).toHaveText('EN');
  await expect(title).not.toContainText('*');

  await page.getByTestId('language-mode-split').check();
  await expect(summary).toHaveText('EN + ID');
  await expect(title).not.toContainText('*');

  await page.getByTestId('language-mode-all').check();
  await expect(summary).toHaveText('All');
  await expect(title).not.toContainText('*');
});

test('Add Language creates translated columns and undoes in one step', async ({ page }) => {
  await openFixture(page, (await readFile(BASIC)).toString('base64'), '01-basic.xlsx', 3);

  await page.getByTestId('language-selector').click();
  await page.getByTestId('add-language').click();
  const dialog = page.getByTestId('add-language-dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('language-code').fill('fr');
  await page.getByTestId('language-name').fill('French');
  await expect(page.getByTestId('language-preview')).toContainText('label::French (fr)');
  await page.getByTestId('add-language-submit').click();

  await expect(page.getByText('Added French (fr)')).toBeVisible();
  await expect(page.getByTestId('document-title')).toContainText('*');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('document-title')).not.toContainText('*');
});

test('Ctrl+K jumps to a variable and runs a command by name', async ({ page }) => {
  await openFixture(page, (await readFile(BASIC)).toString('base64'), '01-basic.xlsx', 3);

  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  const input = page.getByTestId('command-input');
  await input.fill('respondent_age');
  await expect(palette.getByText('Go to variable')).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(palette).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('respondent_age');

  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.getByTestId('command-input').fill('>Keyboard');
  await expect(palette.getByRole('option', { name: /Keyboard shortcuts/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shortcuts-sheet')).toBeVisible();
  // PRD_SHORTCUTS has 22 rows: the 17 PRD §6.2 entries plus Ctrl+F, zoom, and Ctrl+Enter.
  await expect(page.getByTestId('shortcut-row')).toHaveCount(22);
  await expect(
    page.getByTestId('shortcuts-sheet').getByText('Search outline', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('shortcuts-sheet').getByText('Zoom in', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('shortcuts-sheet').getByText('Zoom out', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('shortcuts-sheet').getByText('Reset zoom to 100%', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('shortcuts-sheet').getByText('Delete selected rows', { exact: true }),
  ).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts-sheet')).toHaveCount(0);
  await page.getByTestId('open-shortcuts').click();
  await expect(page.getByTestId('shortcuts-sheet')).toBeVisible();
});
