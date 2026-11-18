import { expect, test } from '@playwright/test';

test('renders refined web landing page without overflow across desktop and 320px viewports', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const landing = page.getByTestId('landing-page');
  await expect(landing).toBeVisible();
  await expect(page.getByTestId('showcase-autocomplete')).toBeVisible();

  const desktopOverflow = await landing.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(desktopOverflow).toBe(false);

  // Step 1 shows XLS-004 diagnostic; clicking a choice binds it live.
  await page.getByTestId('showcase-step-1').click();
  await expect(page.getByTestId('showcase-diagnostic')).toContainText('XLS-004');
  await page.getByTestId('showcase-choice-borehole').click();
  await expect(page.getByTestId('showcase-active-cell')).toContainText(
    "${water_source} = 'borehole'",
  );
  await expect(page.getByTestId('showcase-lint-pill')).toContainText('0 Problems (4 ms)');

  // Theme toggle flips to dark mode cleanly.
  await page.getByTestId('landing-theme-toggle').click();
  await page.getByTestId('landing-theme-toggle').click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(true);

  // 320px reflow check (WCAG 1.4.10).
  await page.setViewportSize({ width: 320, height: 640 });
  const mobileOverflow = await landing.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(mobileOverflow).toBe(false);

  const ctaBox = await page.getByTestId('hero-launch-web-app').boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(ctaBox!.x).toBeGreaterThanOrEqual(0);
  expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(320);

  expect(errors).toEqual([]);
});

test('respects prefers-reduced-motion by starting showcase paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('showcase-play-pause')).toHaveText(/Play/i);
});
