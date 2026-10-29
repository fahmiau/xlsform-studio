/**
 * Whole-app zoom (native webview zoom). The mock IPC bridge records every
 * `set_zoom` call so the test observes what the shell actually asks Rust for.
 */
import { expect, test, type Page } from '@playwright/test';

type ZoomWindow = { __zoomCalls?: number[] };

async function mockTauri(page: Page) {
  await page.addInitScript(() => {
    const internals = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      invoke: async (command: string, args: Record<string, unknown>) => {
        switch (command) {
          case 'set_zoom': {
            const target = window as unknown as ZoomWindow;
            target.__zoomCalls = [...(target.__zoomCalls ?? []), Number(args.scale)];
            return null;
          }
          case 'app_info':
            return { version: '0.1.0', platform: 'windows', arch: 'x86_64' };
          case 'plugin:store|load':
            return 1;
          case 'plugin:store|get':
            return [null, false];
          case 'plugin:store|set':
          case 'plugin:store|save':
          case 'plugin:event|listen':
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
  });
}

function lastZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as unknown as ZoomWindow).__zoomCalls?.at(-1) ?? null);
}

test('zoom shortcuts drive native set_zoom and the preferences select', async ({ page }) => {
  await mockTauri(page);
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // Hydration applies the persisted default (StrictMode may call it twice).
  await expect.poll(() => lastZoom(page)).toBe(1);

  await page.keyboard.press('Control+Equal');
  await expect.poll(() => lastZoom(page)).toBe(1.1);

  await page.keyboard.press('Control+Equal');
  await expect.poll(() => lastZoom(page)).toBe(1.25);

  await page.keyboard.press('Control+Minus');
  await expect.poll(() => lastZoom(page)).toBe(1.1);

  await page.getByTestId('open-preferences').click();
  const zoomSelect = page.getByTestId('pref-zoom');
  await expect(zoomSelect).toBeVisible();
  await expect(zoomSelect).toContainText('110%');
  await page.getByTestId('preferences-dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('preferences-dialog')).toBeHidden();

  await page.keyboard.press('Control+0');
  await expect.poll(() => lastZoom(page)).toBe(1);
});
