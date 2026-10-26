/**
 * Stage 6 e2e: Build Mode with a mocked model.
 *
 * The Tauri IPC mock streams OpenAI-compatible SSE chunks into the `ai_proxy`
 * channel: the first call asks for an education group, the follow-up call
 * returns a short sentence. No network, no key, no Rust.
 */
import ExcelJS from 'exceljs';

import { expect, test, type Page } from '@playwright/test';

async function fixtureBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const survey = workbook.addWorksheet('survey');
  survey.addRow(['type', 'name', 'label']);
  survey.addRow(['text', 'age', 'Age']);
  survey.addRow(['text', 'city', 'City']);
  const choices = workbook.addWorksheet('choices');
  choices.addRow(['list_name', 'name', 'label']);
  const settings = workbook.addWorksheet('settings');
  settings.addRow(['form_title', 'form_id']);
  settings.addRow(['Build fixture', 'build_fixture']);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

const TOOL_INPUT = JSON.stringify({
  afterRowIndex: -1,
  rows: [
    { type: 'begin_group', name: 'education', label: { Default: 'Education' } },
    {
      type: 'select_one education_level',
      name: 'education_level',
      label: { Default: 'Education level' },
    },
    { type: 'end_group' },
  ],
});

function sse(chunks: string[]): string {
  return chunks.map((chunk) => `data: ${chunk}\n\n`).join('');
}

const TOOL_SSE = sse([
  JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen2.5:7b',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'insert_survey_rows', arguments: TOOL_INPUT },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen2.5:7b',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  }),
  '[DONE]',
]);

const TEXT_SSE = sse([
  JSON.stringify({
    id: 'chatcmpl-2',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen2.5:7b',
    choices: [
      {
        index: 0,
        delta: { content: 'Added the education group with three rows.' },
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: 'chatcmpl-2',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen2.5:7b',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  }),
  '[DONE]',
]);

async function mockTauri(page: Page, base64: string): Promise<void> {
  await page.addInitScript(
    (payload) => {
      const prefs = {
        theme: 'light',
        rightPanel: true,
        ai: {
          providers: [
            {
              instanceId: 'p_test',
              presetId: 'ollama',
              label: 'Ollama (local)',
              modelId: 'qwen2.5:7b',
            },
          ],
          activeInstanceId: 'p_test',
        },
      };
      let proxyCalls = 0;
      let callbackId = 0;
      const callbacks = new Map<number, (value: unknown) => void>();
      const internals = {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main', windowLabel: 'main' },
        },
        invoke: async (command: string, args?: Record<string, unknown>) => {
          switch (command) {
            case 'app_info':
              return { version: '0.1.0', platform: 'windows', arch: 'x86_64' };
            case 'plugin:dialog|open':
              return 'C:/forms/build.xlsx';
            case 'plugin:dialog|save':
              return 'C:/forms/saved.xlsx';
            case 'read_workbook':
              return payload.base64;
            case 'save_workbook':
            case 'recovery_write':
            case 'recovery_clear':
            case 'plugin:store|set':
            case 'plugin:store|save':
            case 'plugin:event|listen':
              return null;
            case 'recovery_read':
              return null;
            case 'plugin:store|load':
              return 1;
            case 'plugin:store|get':
              return [prefs, true];
            case 'ai_proxy': {
              proxyCalls += 1;
              const channel = args?.onEvent as { onmessage: (event: unknown) => void };
              const body = proxyCalls === 1 ? payload.toolSse : payload.textSse;
              channel.onmessage({
                type: 'status',
                payload: {
                  code: 200,
                  headers: [{ name: 'content-type', value: 'text/event-stream' }],
                },
              });
              channel.onmessage({
                type: 'chunk',
                payload: btoa(body),
              });
              channel.onmessage({ type: 'done' });
              return null;
            }
            case 'ai_proxy_cancel':
              return null;
            case 'secret_status':
              return { bound: true, hasKey: false };
            case 'secret_set':
            case 'secret_delete':
              return null;
            default:
              return null;
          }
        },
        transformCallback: (callback: (value: unknown) => void) => {
          const id = (callbackId += 1);
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
      };
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = internals;
    },
    { base64, toolSse: TOOL_SSE, textSse: TEXT_SSE },
  );
}

async function openBuildMode(page: Page) {
  await mockTauri(page, await fixtureBase64());
  await page.goto('/');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');
  await page.getByRole('tab', { name: 'AI Assistant' }).click();
  await expect(page.getByTestId('ai-drawer')).toBeVisible();
  await page.getByTestId('ai-mode-build').click();
}

async function runPrompt(page: Page) {
  await page.getByTestId('ai-build-input').fill('Add an education group');
  await page.getByTestId('ai-build-send').click();
  await expect(page.getByTestId('ai-staging-bar')).toBeVisible();
}

test.describe('Build Mode staging (Task 6.7)', () => {
  test('stages a group, accepts it in one undo step, and Ctrl+Z reverts it', async ({ page }) => {
    await openBuildMode(page);
    await runPrompt(page);

    await expect(page.getByTestId('ai-staging-summary')).toContainText('3 changes');
    await expect(page.getByTestId('ai-staging-summary')).toContainText('1 group created');
    await expect(page.getByTestId('ai-staging-lock')).toBeVisible();
    await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');

    await page.getByTestId('ai-accept').click();
    await expect(page.getByTestId('ai-staging-bar')).toHaveCount(0);
    await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (5)');

    // One accept = one undo entry: a single Ctrl+Z restores the original form.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');
  });

  test('revert leaves the document untouched', async ({ page }) => {
    await openBuildMode(page);
    await runPrompt(page);
    await page.getByTestId('ai-revert').click();
    await expect(page.getByTestId('ai-staging-bar')).toHaveCount(0);
    await expect(page.getByTestId('sheet-tab-survey')).toHaveText('survey (2)');
    await expect(page.getByTestId('ai-build-input')).toBeEnabled();
  });

  test('locks editing while a stage is pending', async ({ page }) => {
    await openBuildMode(page);
    await runPrompt(page);
    await expect(page.getByTestId('ai-build-input')).toBeDisabled();
    await expect(page.getByTestId('ai-staging-lock')).toContainText('Accept or Revert');
    await page.getByTestId('ai-revert').click();
    await expect(page.getByTestId('ai-build-input')).toBeEnabled();
  });
});
