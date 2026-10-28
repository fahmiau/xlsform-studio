/**
 * Stage 3 smoke: type editor routing, drawer binding, and the Outline panel.
 * The grid is canvas-based, so assertions use the formula bar and panels.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from '../../src/features/grid/geometry';

const BASIC = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');
const GROUPS = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/15-unbalanced-groups.xlsx');

// Glide's row-marker column (Stage 3 drawer drag) and the compact gutter width.
const ROW_MARKER_WIDTH = 32;
const DRAWER_GUTTER_WIDTH = 48;

async function mockTauri(page: Page, fixturePath = BASIC, fileName = '01-basic.xlsx') {
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

async function openFixture(page: Page, fixture = BASIC, fileName = '01-basic.xlsx') {
  await mockTauri(page, fixture, fileName);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText(/^survey \(\d+\)$/);
}

test('type editor fuzzy search binds a list and undo restores the type', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('text');

  await page.keyboard.press('Enter');
  const input = page.getByTestId('type-editor-input');
  await expect(input).toBeVisible();
  await input.fill('');
  await input.type('sel1');
  await expect(page.getByText('select_one', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('create-list-option')).toBeVisible();
  await page.getByText('yes_no', { exact: true }).click();
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('select_one yes_no');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('text');
});

test('choices drawer follows a select row and lists its choices', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('select_one yes_no');

  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('choices-drawer')).toBeVisible();
  await expect(page.getByTestId('drawer-list-name')).toHaveText('yes_no');
  await expect(page.getByTestId('choice-count')).toHaveText('2 choices');
  await expect(page.getByTestId('shared-list-banner')).toHaveCount(0);
});

test('changing a type to begin_repeat auto-inserts the end row in one undo step', async ({
  page,
}) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');

  const input = page.getByTestId('type-editor-input');
  await expect(input).toBeVisible();
  await input.fill('begin_repeat');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (4)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('wrap with Ctrl+G, fold with Ctrl+[, and undo the wrap in one step', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');

  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (5)');
  const outline = page.getByTestId('outline-panel');
  await expect(outline.getByText('group_1', { exact: true })).toBeVisible();

  await page.keyboard.press('Control+BracketLeft');
  await expect(outline.getByText('(2 hidden)')).toBeVisible();
  await page.keyboard.press('Control+BracketRight');
  await expect(outline.getByText('(2 hidden)')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
});

test('outline lists groups and questions and jumps to the grid', async ({ page }) => {
  await openFixture(page, GROUPS, '15-unbalanced-groups.xlsx');
  await expect(page.getByTestId('outline-tree')).toBeVisible();
  const outline = page.getByTestId('outline-panel');
  await expect(outline.getByText('outer', { exact: true })).toBeVisible();
  await outline.getByText('outer', { exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (10)');
});

test('undo of an edit inside a collapsed group expands and reveals the row', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (5)');

  const outline = page.getByTestId('outline-panel');
  await outline.getByText('respondent_name', { exact: true }).click();
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  const formula = page.getByTestId('formula-bar-input');
  await formula.fill('renamed');
  await formula.press('Enter');
  await expect(formula).toHaveValue('renamed');

  await page.keyboard.press('Control+BracketLeft');
  await expect(outline.getByText('(2 hidden)')).toBeVisible();

  await page.getByTestId('undo-button').click();
  await expect(outline.getByText('(2 hidden)')).toHaveCount(0);
  await expect(formula).toHaveValue('respondent_name');
});

test('plain Delete clears a choice label in the drawer and keeps the row', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('choices-drawer')).toBeVisible();

  const drawerCanvas = page.getByTestId('drawer-grid').locator('canvas').first();
  await drawerCanvas.waitFor();
  await drawerCanvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  const formula = page.getByTestId('formula-bar-input');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: label]');
  await expect(formula).toHaveValue('Yes');

  await page.keyboard.press('Delete');
  await expect(formula).toHaveValue('');
  await expect(page.getByTestId('choice-count')).toHaveText('2 choices');

  await page.keyboard.press('Control+z');
  await expect(formula).toHaveValue('Yes');
});

test('Shift+Delete deletes the selected choice row in the drawer', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('choices-drawer')).toBeVisible();

  const drawerCanvas = page.getByTestId('drawer-grid').locator('canvas').first();
  await drawerCanvas.waitFor();
  await drawerCanvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: label]');

  await page.keyboard.press('Shift+Delete');
  await expect(page.getByTestId('choice-count')).toHaveText('1 choices');
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('choice-count')).toHaveText('2 choices');
});

test('dragging a drawer row marker reorders the list in one undo step', async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  await canvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('select_one yes_no');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('choices-drawer')).toBeVisible();

  const drawerCanvas = page.getByTestId('drawer-grid').locator('canvas').first();
  await drawerCanvas.waitFor();
  await drawerCanvas.focus();
  const box = await drawerCanvas.boundingBox();
  if (!box) throw new Error('drawer grid canvas has no layout box');

  // Glide only starts a row drag on its own marker column.
  const markerX = box.x + ROW_MARKER_WIDTH / 2;
  const firstRowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  const secondRowY = firstRowY + GRID_ROW_HEIGHT;
  await page.mouse.move(markerX, firstRowY);
  await page.mouse.down();
  await page.mouse.move(markerX, secondRowY, { steps: 8 });
  await page.mouse.up();

  // A workbook write is the barrier: the drag landed before the row is read.
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved');

  // Label is the first drawer column, after the marker column and the gutter.
  // Click row 2 to anchor selection: Glide's hidden input swallows the first
  // click on row 1, so row 1 is read with the keyboard from row 2.
  const labelX = box.x + ROW_MARKER_WIDTH + DRAWER_GUTTER_WIDTH + 60;
  await page.mouse.click(labelX, secondRowY);
  const formula = page.getByTestId('formula-bar-input');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: label]');
  await expect(formula).toHaveValue('Yes');
  await page.keyboard.press('ArrowUp');
  await expect(formula).toHaveValue('No');

  // One drag = one apply: a single undo restores the original Yes/No order.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(formula).toHaveValue('Yes');
});

test('a name typed on the choices tab survives a later label edit', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('sheet-tab-choices').click();
  const canvas = page.getByTestId('sheet-grid-choices').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('choices grid canvas has no layout box');
  // list_name (140 px) follows the 88 px gutter; name is the next column.
  await page.mouse.click(box.x + 88 + 140 + 40, box.y + 34 + 17);
  const formula = page.getByTestId('formula-bar-input');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(formula).toHaveValue('yes');
  await formula.fill('manual_code');
  await formula.press('Enter');
  await expect(formula).toHaveValue('manual_code');

  await page.getByTestId('sheet-tab-survey').click();
  const surveyCanvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await surveyCanvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('select_one yes_no');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('choices-drawer')).toBeVisible();

  const drawerCanvas = page.getByTestId('drawer-grid').locator('canvas').first();
  await drawerCanvas.waitFor();
  await drawerCanvas.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: label]');
  const drawerFormula = page.getByTestId('formula-bar-input');
  await expect(drawerFormula).toHaveValue('Yes');
  await drawerFormula.fill('Yes indeed');
  await drawerFormula.press('Enter');

  await page.getByTestId('sheet-tab-choices').click();
  const choicesCanvas = page.getByTestId('sheet-grid-choices').locator('canvas').first();
  await choicesCanvas.waitFor();
  // list_name (140 px) follows the 88 px gutter; name is the next column.
  await page.mouse.click(box.x + 88 + 140 + 40, box.y + 34 + 17);
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');
  await expect(page.getByTestId('formula-bar-input')).toHaveValue('manual_code');
});
