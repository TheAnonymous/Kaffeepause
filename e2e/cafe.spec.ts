import { expect, test } from '@playwright/test';

test('betritt das Café, füllt den Viewport und schaltet den Ton', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kaffeepause' })).toBeVisible();
  const canvas = page.getByRole('img', { name: /gemütliches.*Café/i });
  await expect(canvas).toHaveAttribute('data-camera-mode', 'overview');
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual({ width: 1280, height: 720 });

  await page.getByRole('button', { name: 'Café betreten' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-entered', 'true');
  await expect(page.getByTestId('welcome')).toHaveClass(/is-hidden/);
  const sound = page.getByTestId('sound');
  await expect(sound).toBeVisible();
  await expect(sound).toHaveAttribute('data-audio-state', /playing|unavailable/);
  if (await sound.isEnabled()) {
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await expect(sound).toHaveAttribute('aria-label', 'Ton einschalten');
  }
  await expect(canvas).toHaveAttribute('data-guest-count', /[4-6]/);
  expect(errors).toEqual([]);
});

test('wechselt bei schmalem Resize in die ruhige Kamerafahrt', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-logical-width', '384');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute('data-camera-mode', 'tour');
  expect(Number(await canvas.getAttribute('data-logical-width'))).toBeLessThan(384);
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
});

test.use({ viewport: { width: 390, height: 844 } });
test('respektiert reduzierte Bewegung ohne automatische Kamerafahrt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const canvas = page.locator('#cafe');
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'still');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  const position = await canvas.getAttribute('data-camera-x');
  await page.getByTestId('enter').click();
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-camera-x', position ?? '0.0');
});
