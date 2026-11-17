/**
 * Keyboard-driven grid smoke tests (Tasks 2.2–2.8) with mocked Tauri IPC.
 * The grid is a canvas, so assertions use the formula bar and sheet-tab counts.
 */
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from '../../src/features/grid/geometry';

const FIXTURE = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');

async function mockTauriBase64(page: Page, base64: string, fileName: string) {
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

async function mockTauri(page: Page, fixturePath = FIXTURE, fileName = '01-basic.xlsx') {
  const base64 = (await readFile(fixturePath)).toString('base64');
  await mockTauriBase64(page, base64, fileName);
}

async function openFixture(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
}

/**
 * Click through the first data row until the `relevant` cell is selected. The
 * grid is canvas, so the active column is identified through the formula bar;
 * each probe closes any overlay a previous click opened (it covers `relevant`).
 */
async function openRelevantCell(page: Page): Promise<void> {
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');

  const column = page.getByTestId('formula-bar-column');
  const rowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  let found = false;
  for (let x = 60; x <= box.width - 20; x += 40) {
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + x, rowY);
    if ((await column.textContent()) === '[Column: relevant]') {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
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
  await openRelevantCell(page);
  const column = page.getByTestId('formula-bar-column');

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

test('accepts a function completion with Enter in the in-cell XPath editor', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);
  await openRelevantCell(page);

  // Enter activates the selected cell's overlay editor.
  await page.keyboard.press('Enter');
  const editor = page.getByTestId('cell-formula-editor');
  await expect(editor).toBeVisible();
  await page.keyboard.type('if');

  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  // CodeMirror ignores accept keys during its 75 ms interaction delay.
  await page.waitForTimeout(150);

  await page.keyboard.press('Enter');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-content')).toHaveText('if()');

  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('if()');
});

test('keeps the in-cell editor open when a completion item is clicked', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);
  await openRelevantCell(page);

  await page.keyboard.press('Enter');
  const editor = page.getByTestId('cell-formula-editor');
  await expect(editor).toBeVisible();
  await page.keyboard.type('if');

  const popup = page.locator('.cm-tooltip-autocomplete');
  await expect(popup).toBeVisible();
  await popup.locator('li', { hasText: 'if(cond' }).click();

  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-content')).toHaveText('if()');

  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('if()');
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

test('Backspace clears the selected cell, undoes, and redoes on the same column', async ({
  page,
}) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');

  const column = page.getByTestId('formula-bar-column');
  const formula = page.getByTestId('formula-bar-input');
  await expect(column).toHaveText('[Column: name]');
  const original = await formula.inputValue();
  expect(original).not.toBe('');

  await page.keyboard.press('Backspace');
  await expect(formula).toHaveValue('');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');

  await page.keyboard.press('Control+z');
  await expect(column).toHaveText('[Column: name]');
  await expect(formula).toHaveValue(original);

  await page.keyboard.press('Control+y');
  await expect(column).toHaveText('[Column: name]');
  await expect(formula).toHaveValue('');
});

test('Ctrl+Z and Ctrl+Y reveal the exact changed row and column across columns', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);

  // Edit `relevant` (scrollable column) on row 0.
  await openRelevantCell(page);
  await page.keyboard.press('$');
  const cellEditor = page.getByTestId('cell-formula-editor');
  await expect(cellEditor).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(cellEditor).toHaveCount(0);

  // Clear `name` (frozen column) on row 1.
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');
  await page.mouse.click(box.x + 250, box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 1.5);
  const column = page.getByTestId('formula-bar-column');
  const formula = page.getByTestId('formula-bar-input');
  await expect(column).toHaveText('[Column: name]');
  const originalName = await formula.inputValue();
  expect(originalName).not.toBe('');

  await page.keyboard.press('Backspace');
  await expect(formula).toHaveValue('');

  // Move to a different row & column (`relevant` on row 2) before undoing.
  await openRelevantCell(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(column).toHaveText('[Column: relevant]');

  // First Ctrl+Z must restore row 1 `name` and highlight [Column: name], NOT `relevant`.
  await page.keyboard.press('Control+z');
  await expect(column).toHaveText('[Column: name]');
  await expect(formula).toHaveValue(originalName);

  // Move away again; Ctrl+Y must highlight [Column: name] on row 1 and clear it.
  await openRelevantCell(page);
  await page.keyboard.press('Control+y');
  await expect(column).toHaveText('[Column: name]');
  await expect(formula).toHaveValue('');

  // Two Ctrl+Z presses restore row 1 `name` then row 0 `relevant`.
  await page.keyboard.press('Control+z');
  await expect(column).toHaveText('[Column: name]');
  await expect(formula).toHaveValue(originalName);

  await page.keyboard.press('Control+z');
  await expect(column).toHaveText('[Column: relevant]');
  await expect(page.getByTestId('formula-bar-editor').locator('.cm-content')).toHaveText('');
});

test('clearing an XPath cell in the formula bar blurs on Enter so Ctrl+Z undoes immediately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);
  await openRelevantCell(page);

  const barContent = page.getByTestId('formula-bar-editor').locator('.cm-content');
  await barContent.click();
  await page.keyboard.type('1 = 1');
  await page.keyboard.press('Enter');
  await expect(barContent).toHaveText('1 = 1');

  // Clear via formula bar, press Enter, and immediately press Ctrl+Z without clicking away.
  await barContent.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(barContent).toHaveText('');

  await page.keyboard.press('Control+z');
  await expect(barContent).toHaveText('1 = 1');
});

async function buildTallAndLintFixtureBase64(rowCount = 90): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const survey = workbook.addWorksheet('survey');
  survey.addRow(['type', 'name', 'label']);
  for (let i = 0; i < rowCount; i += 1) {
    if (i === 10) {
      survey.addRow(['text', 'q1a_nama_responden', '']);
    } else if (i === 11) {
      survey.addRow(['text', 'g_0', 'First g_0']);
    } else if (i === 52) {
      survey.addRow(['text', 'g_0', 'Duplicate g_0']);
    } else {
      survey.addRow(['text', `q_${i}`, `Question ${i}`]);
    }
  }
  const choices = workbook.addWorksheet('choices');
  choices.addRow(['list_name', 'name', 'label']);
  const settings = workbook.addWorksheet('settings');
  settings.addRow(['form_title', 'form_id']);
  settings.addRow(['Tall form', 'tall_form']);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

async function isRowVisibleInGrid(page: Page, rowIndex: number): Promise<boolean> {
  return page
    .getByTestId('sheet-grid-survey')
    .locator('.dvn-scroller')
    .evaluate(
      (scroller, args) => {
        const top = args.row * args.rowHeight;
        const bottom = top + args.rowHeight;
        const viewTop = scroller.scrollTop;
        const viewBottom = viewTop + scroller.clientHeight - args.headerHeight;
        return top >= viewTop && bottom <= viewBottom;
      },
      { row: rowIndex, rowHeight: GRID_ROW_HEIGHT, headerHeight: GRID_HEADER_HEIGHT },
    );
}

test('Ctrl+Z and Ctrl+Y scroll the target row into view even when scrolled far away', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await mockTauriBase64(page, await buildTallAndLintFixtureBase64(90), 'tall-form.xlsx');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (90)');

  const grid = page.getByTestId('sheet-grid-survey');
  const scroller = grid.locator('.dvn-scroller');
  await scroller.waitFor();

  // Scroll to row 30 and edit its `name` cell.
  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 30 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);

  const canvas = grid.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');
  // Click row 30 (`name` column around x=240, first visible row below header).
  await page.mouse.click(box.x + 240, box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 0.5);
  const formula = page.getByTestId('formula-bar-input');
  await expect(formula).toHaveValue('q_30');
  await formula.fill('q_30_edited');
  await formula.press('Enter');
  await expect(formula).toHaveValue('q_30_edited');

  // Scroll far down to row 78, click row 78, then Ctrl+Z back to row 30.
  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 78 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + 240, box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 0.5);
  await expect(formula).toHaveValue('q_78');

  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('q_30');
  await expect.poll(() => isRowVisibleInGrid(page, 30)).toBe(true);

  // Scroll far down to row 78 again, click row 78, then Ctrl+Y back to row 30.
  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 78 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + 240, box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 0.5);
  await expect(formula).toHaveValue('q_78');

  await page.keyboard.press('Control+y');
  await expect(formula).toHaveValue('q_30_edited');
  await expect.poll(() => isRowVisibleInGrid(page, 30)).toBe(true);

  // Scroll far down WITHOUT clicking away, then Ctrl+Y/Ctrl+Z must still reveal row 30.
  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 78 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('q_30');
  await expect.poll(() => isRowVisibleInGrid(page, 30)).toBe(true);

  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 78 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+y');
  await expect(formula).toHaveValue('q_30_edited');
  await expect.poll(() => isRowVisibleInGrid(page, 30)).toBe(true);

  // Also test the opposite direction: scroll all the way back up to row 0 while a
  // deep row (row 75) has an undo/redo edit, then Ctrl+Z / Ctrl+Y down to row 75.
  await scroller.evaluate((el, y) => {
    el.scrollTop = y;
  }, 75 * GRID_ROW_HEIGHT);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + 240, box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT * 0.5);
  await expect(formula).toHaveValue('q_75');
  await formula.fill('q_75_edited');
  await formula.press('Enter');
  await expect(formula).toHaveValue('q_75_edited');

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('q_75');
  await expect.poll(() => isRowVisibleInGrid(page, 75)).toBe(true);

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+y');
  await expect(formula).toHaveValue('q_75_edited');
  await expect.poll(() => isRowVisibleInGrid(page, 75)).toBe(true);
});

test('lint hover tooltip appears next to the hovered cell and wraps long text cleanly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await mockTauriBase64(page, await buildTallAndLintFixtureBase64(30), 'lint-hover.xlsx');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (30)');

  // Wait for lint diagnostics to settle so markers are indexed.
  await page.getByTestId('lint-badge').click();
  await expect(page.getByText('XLS-010').first()).toBeVisible();

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('grid canvas has no layout box');

  // Row 10 (`q1a_nama_responden`) has XLS-010 on `label` (around x=420).
  const hoverX = box.x + 420;
  const hoverY = box.y + GRID_HEADER_HEIGHT + 10 * GRID_ROW_HEIGHT + GRID_ROW_HEIGHT * 0.5;
  await page.mouse.move(hoverX, hoverY);

  const tooltip = page.getByTestId('cell-diagnostic-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('XLS-010');

  const tooltipBox = await tooltip.boundingBox();
  if (!tooltipBox) throw new Error('diagnostic tooltip has no layout box');
  // Tooltip must be anchored near the hovered cell (not pinned near row 0 at top).
  expect(tooltipBox.y).toBeGreaterThan(box.y + GRID_HEADER_HEIGHT + 5 * GRID_ROW_HEIGHT);
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(hoverY + 10);

  // Text must fit inside the tooltip border without horizontal overflow.
  const overflow = await tooltip.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('direct typing on frozen columns opens editor and Enter keeps focus on edited cell', async ({
  page,
}) => {
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('respondent_age');

  await page.keyboard.type('age_direct');
  const editor = page.getByTestId('text-cell-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue('age_direct');

  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('age_direct');
});
