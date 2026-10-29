/**
 * Keyboard-driven grid smoke tests (Tasks 2.2–2.8) with mocked Tauri IPC.
 * The grid is a canvas, so assertions use the formula bar and sheet-tab counts.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from '../../src/features/grid/geometry';

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
  await page.getByRole('button', { name: 'Open', exact: true }).click();
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

test('in-cell XPath editor keeps "$" visible and commits it (StrictMode)', async ({ page }) => {
  // Wide viewport so the `relevant` column is on screen without horizontal
  // scrolling; the grid is canvas, so find the column through the formula bar.
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');

  const column = page.getByTestId('formula-bar-column');
  const rowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  let found = false;
  for (let x = 60; x <= box.width - 20; x += 40) {
    // A second click on a cell opens its editor; the in-cell formula editor is
    // wide enough to cover `relevant`, so close it before probing the next x.
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + x, rowY);
    if ((await column.textContent()) === '[Column: relevant]') {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);

  // Typing "$" opens Glide's overlay with initialValue "$". StrictMode used to
  // tear the CodeMirror mount down once, blur, commit, and close the editor.
  await page.keyboard.press('$');
  const editor = page.getByTestId('cell-formula-editor');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-content')).toHaveText('$');

  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('$');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('');

  // Clicking outside must commit the document Glide's overlay is tracking,
  // which is why the editor seeds `tempValue` on mount.
  await page.keyboard.press('$');
  await expect(editor.locator('.cm-content')).toHaveText('$');
  await column.click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('$');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('');
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

test('append a row from the trailing ghost row and undo it', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');

  // Header is 34 px and each data row is 34 px, so the ghost row after the
  // three fixture rows sits at 34 + 3 * 34 + 17.
  const ghostRowY = GRID_HEADER_HEIGHT + 3 * GRID_ROW_HEIGHT + GRID_ROW_HEIGHT / 2;
  await page.mouse.click(box.x + 120, box.y + ghostRowY);
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');

  const editor = page.getByTestId('type-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill('note');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);

  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');

  await page.getByTestId('undo-button').click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');
  await page.getByTestId('undo-button').click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('plain Delete clears the selected cell, keeps the row, and undoes', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  // type → name → label → hint, so the hint text of the second row is active.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const formula = page.getByTestId('formula-bar-input');
  await expect(formula).toHaveValue('In years');

  await page.keyboard.press('Delete');
  await expect(formula).toHaveValue('');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');

  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('In years');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('Shift+Delete deletes the selected row and undoes', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');

  await page.keyboard.press('Shift+Delete');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('Ctrl+Delete deletes the selected row and undoes', async ({ page }) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');

  await page.keyboard.press('Control+Delete');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('context menus open at the pointer for cells and headers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');

  // x = 250 sits in the frozen `name` column (gutter 88 + type 130) and
  // y = one and a half rows down puts the pointer on the second data row. Both
  // pre-fix offsets (cell-left and row-top) are far above the 12 px tolerance,
  // so a menu anchored to the grid's left edge can never pass.
  const clickX = box.x + 250;
  const cellY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 1.5;

  await page.mouse.click(clickX, cellY, { button: 'right' });
  const rowMenu = page.getByTestId('row-context-menu');
  await expect(rowMenu).toBeVisible();
  const rowBox = await rowMenu.boundingBox();
  if (!rowBox) throw new Error('row menu has no layout box');
  expect(Math.abs(rowBox.x - clickX)).toBeLessThanOrEqual(12);
  expect(Math.abs(rowBox.y - cellY)).toBeLessThanOrEqual(12);

  await page.keyboard.press('Escape');
  await expect(rowMenu).toHaveCount(0);

  const headerY = box.y + GRID_HEADER_HEIGHT / 2;
  await page.mouse.click(clickX, headerY, { button: 'right' });
  const headerMenu = page.getByTestId('header-menu');
  await expect(headerMenu).toBeVisible();
  const headerBox = await headerMenu.boundingBox();
  if (!headerBox) throw new Error('header menu has no layout box');
  expect(Math.abs(headerBox.x - clickX)).toBeLessThanOrEqual(12);
  expect(Math.abs(headerBox.y - headerY)).toBeLessThanOrEqual(12);
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
