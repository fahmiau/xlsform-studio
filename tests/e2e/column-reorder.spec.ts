/**
 * Column reorder smoke (Category C4): dragging a header changes the display
 * order for the session without touching file order.
 *
 * The grid is canvas-based, so the assertion goes through the formula bar and
 * pixel positions derived from the fixed default widths. Tauri IPC is mocked.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from '../../src/features/grid/geometry';

const BASIC = join(process.cwd(), 'tests/fixtures/xlsx/synthetic/01-basic.xlsx');

// Glide draws a 32 px row-marker column before the app's columns for <=100 rows.
const ROW_MARKER_WIDTH = 32;
// Gutter width from src/features/grid/columns.ts.
const GUTTER_WIDTH = 48;
// SURVEY_GRID_CONFIG defaults; `relevant` has no default and falls back to 160.
// Duplicated here because the Playwright runner does not resolve the app's `@/`
// import alias.
const SURVEY_WIDTHS: Record<string, number> = {
  type: 130,
  name: 150,
  label: 240,
  hint: 200,
  required: 80,
  relevant: 160,
};

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

async function openFixture(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (3)');
}

const DEFAULT_ORDER = ['type', 'name', 'label', 'hint', 'required', 'relevant'];

/** Left edge of a data column inside the canvas, in canvas-local pixels. */
function columnLeft(key: string, order: readonly string[] = DEFAULT_ORDER): number {
  let x = ROW_MARKER_WIDTH + GUTTER_WIDTH;
  for (const candidate of order) {
    if (candidate === key) return x;
    x += SURVEY_WIDTHS[candidate] ?? 0;
  }
  throw new Error(`unknown column ${key}`);
}

function columnCenter(key: string, order: readonly string[] = DEFAULT_ORDER): number {
  return columnLeft(key, order) + (SURVEY_WIDTHS[key] ?? 0) / 2;
}

test('dragging a header reorders the display columns and remembers them per sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('survey grid canvas has no layout box');

  const headerY = box.y + GRID_HEADER_HEIGHT / 2;
  const column = page.getByTestId('formula-bar-column');
  const rowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  // Establish an active cell so the drop's column-signature change has to keep
  // the selection on the same key.
  await page.mouse.click(box.x + columnCenter('hint'), rowY);
  await expect(column).toHaveText('[Column: hint]');

  // Before: type, name, label, hint, required, relevant.
  // Drag `relevant` (last) onto `hint` (first scrollable column).
  await page.mouse.move(box.x + columnCenter('relevant'), headerY);
  await page.mouse.down();
  await page.mouse.move(box.x + columnCenter('hint'), headerY, { steps: 12 });
  await page.mouse.up();

  // `hint` moved with its selection: the next column is still `required`.
  await page.keyboard.press('ArrowRight');
  await expect(column).toHaveText('[Column: required]');

  // The first scrollable cell is now `relevant`.
  await page.mouse.click(box.x + columnLeft('hint') + 40, rowY);
  await expect(column).toHaveText('[Column: relevant]');

  // Switch to choices and back: the per-sheet session order survives.
  await page.getByTestId('sheet-tab-choices').click();
  await expect(page.getByTestId('sheet-tab-choices')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('sheet-tab-survey').click();

  const restored = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await restored.waitFor();
  const restoredBox = await restored.boundingBox();
  if (!restoredBox) throw new Error('restored survey grid canvas has no layout box');
  await page.mouse.click(
    restoredBox.x + columnLeft('hint') + 40,
    restoredBox.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2,
  );
  await expect(column).toHaveText('[Column: relevant]');
});

test('dragging a frozen header reorders only inside the frozen block', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);

  const canvas = page.getByTestId('sheet-grid-survey').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('survey grid canvas has no layout box');

  const headerY = box.y + GRID_HEADER_HEIGHT / 2;
  // type, name, label are frozen; drag `name` onto `type`.
  await page.mouse.move(box.x + columnCenter('name'), headerY);
  await page.mouse.down();
  await page.mouse.move(box.x + columnCenter('type'), headerY, { steps: 12 });
  await page.mouse.up();

  const column = page.getByTestId('formula-bar-column');
  const rowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  const reordered = ['name', 'type', 'label', 'hint', 'required', 'relevant'];
  // Glide leaves the dropped column selected; click a different column first so
  // the next click is a real cell selection.
  await page.mouse.click(box.x + columnCenter('label', reordered), rowY);
  await expect(column).toHaveText('[Column: label]');
  await page.mouse.click(box.x + columnCenter('type', reordered), rowY);
  await expect(column).toHaveText('[Column: type]');
  await page.mouse.click(box.x + columnCenter('name', reordered), rowY);
  await expect(column).toHaveText('[Column: name]');

  // The scrollable block after the frozen set is untouched.
  await page.mouse.click(box.x + columnCenter('hint', reordered), rowY);
  await expect(column).toHaveText('[Column: hint]');
});

test('settings columns reorder with only the gutter frozen', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockTauri(page);
  await openFixture(page);
  await page.getByTestId('sheet-tab-settings').click();
  await page.getByRole('tab', { name: 'grid', exact: true }).click();

  const canvas = page.getByTestId('sheet-grid-settings').locator('canvas').first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('settings grid canvas has no layout box');

  // Marker + gutter, then form_title (260), form_id (180), version (120).
  const left = (offset: number) => box.x + ROW_MARKER_WIDTH + GUTTER_WIDTH + offset;
  const headerY = box.y + GRID_HEADER_HEIGHT / 2;
  await page.mouse.move(left(260 + 180 + 60), headerY);
  await page.mouse.down();
  await page.mouse.move(left(130), headerY, { steps: 12 });
  await page.mouse.up();

  const column = page.getByTestId('formula-bar-column');
  const rowY = box.y + GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT / 2;
  // version (120) now leads: form_title starts at 120 and version at 0.
  await page.mouse.click(left(120 + 130), rowY);
  await expect(column).toHaveText('[Column: form_title]');
  await page.mouse.click(left(60), rowY);
  await expect(column).toHaveText('[Column: version]');
});
