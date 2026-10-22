/**
 * Stage 4 smoke: lint badge, panel grouping, click-to-jump across sheets.
 * The fixture is generated in memory so the test owns every diagnostic.
 */
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';

async function fixtureBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const survey = workbook.addWorksheet('survey');
  survey.addRow(['type', 'name', 'label', 'relevant']);
  survey.addRow(['text', 'q1', 'Question 1', '']);
  survey.addRow(['integer', 'q2', '', '${missing}']);
  const choices = workbook.addWorksheet('choices');
  choices.addRow(['list_name', 'name', 'label']);
  choices.addRow(['yes_no', 'yes', 'Yes']);
  choices.addRow(['yes_no', 'yes', 'Yes again']);
  const settings = workbook.addWorksheet('settings');
  settings.addRow(['form_title', 'form_id']);
  settings.addRow(['Lint fixture', 'lint_fixture']);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

test('lint badge, panel, and click-to-jump work across sheets', async ({ page }) => {
  const base64 = await fixtureBase64();
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
              return 'C:/forms/lint-fixture.xlsx';
            case 'read_workbook':
              return payload.base64;
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
    },
    { base64 },
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');

  const badge = page.getByTestId('lint-badge');
  await expect(badge).toContainText('Error');
  await badge.click();
  await expect(page.getByTestId('lint-panel')).toBeVisible();
  await expect(page.getByTestId('lint-group-survey')).toBeVisible();
  await expect(page.getByTestId('lint-group-choices')).toBeVisible();

  await page.locator('[data-testid="lint-item"][data-rule="XLS-004"]').first().click();
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: relevant]');
  await expect(page.getByTestId('formula-bar-editor')).toContainText('${missing}');

  await page.locator('[data-testid="lint-item"][data-rule="XLS-007"]').first().click();
  await expect(page.getByTestId('sheet-tab-choices')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('formula-bar-column')).toHaveText('[Column: name]');

  await page.keyboard.press('F8');
  await expect(page.getByTestId('lint-badge')).toBeVisible();
});
