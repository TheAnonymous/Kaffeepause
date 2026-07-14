import { expect, test } from '@playwright/test';

test('betritt das Café, füllt den Viewport und schaltet den Ton', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 810 });
  await page.goto('/?time=12:30&weather=clear');
  await expect(page.getByRole('heading', { name: 'Kaffeepause' })).toBeVisible();
  const canvas = page.getByRole('img', { name: /gemütliches.*Café/i });
  await expect(canvas).toHaveAttribute('data-camera-mode', 'overview');
  await expect(canvas).toHaveAttribute('data-logical-width', '2304');
  await expect(canvas).toHaveAttribute('data-scene-width', '384');
  await expect(canvas).toHaveAttribute('data-render-scale', '6');
  await expect(canvas).toHaveAttribute('data-character-detail', '144x208-original-pixel-sprite');
  await expect(canvas).toHaveAttribute('data-render-quality', 'webgl-diorama-master');
  await expect(canvas).toHaveAttribute('data-master-resolution', '2304x1296');
  await expect(canvas).toHaveAttribute('data-character-raster-height', '208');
  await expect(canvas).toHaveAttribute('data-renderer', 'webgl-diorama');
  await expect(canvas).toHaveAttribute('data-depth-model', 'physical-2.5d');
  await expect(canvas).toHaveAttribute('data-diorama-scale-check', 'pass');
  await expect(canvas).toHaveAttribute('data-navigation', 'collision-aware');
  await expect(canvas).toHaveAttribute('data-proportion-check', 'pass');
  await expect(canvas).toHaveAttribute('data-layout-score', '100');
  await expect(canvas).toHaveAttribute('data-scale-model', '32px-adult');
  await expect(canvas).toHaveAttribute('data-character-variation', '12-silhouettes');
  await expect(canvas).toHaveAttribute('data-character-diversity', '100');
  expect(await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return { width: target.width, height: target.height };
  }))
    .toEqual({ width: 2304, height: 1296 });
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 1440, height: 810 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual({ width: 1440, height: 810 });

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
  await expect(canvas).toHaveAttribute('data-guest-count', /[4-8]/);
  expect(errors).toEqual([]);
});

for (const venue of [
  { kind: 'ramen', label: 'Ramen', entry: 'Ramen-Restaurant betreten', canvas: /Ramen-Restaurant/i },
  { kind: 'arcade', label: 'Arcade', entry: 'Arcade-Halle betreten', canvas: /Arcade-Halle/i },
] as const) {
  test(`wechselt vor dem Eintritt in die ${venue.kind}-Szene`, async ({ page }) => {
    await page.goto('/?time=20:30&weather=rain');
    await page.getByRole('radio', { name: new RegExp(venue.label) }).click();

    const canvas = page.locator('#cafe');
    await expect(page.locator('body')).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAccessibleName(venue.canvas);
    await expect(page.getByRole('button', { name: venue.entry })).toBeVisible();

    await page.getByRole('button', { name: venue.entry }).click();
    await expect(page.locator('body')).toHaveAttribute('data-entered', 'true');
    await expect(canvas).toHaveAttribute('data-venue', venue.kind);
  });
}

test('wechselt bei schmalem Resize in die ruhige Kamerafahrt', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-logical-width', '2304');
  await expect(canvas).toHaveAttribute('data-scene-width', '384');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute('data-camera-mode', 'tour');
  await expect(canvas).toHaveAttribute('data-logical-width', '672');
  await expect(canvas).toHaveAttribute('data-scene-width', '112');
  expect(await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return { width: target.width, height: target.height };
  }))
    .toEqual({ width: 672, height: 1296 });
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual({ width: 390, height: 844 });
});

test.use({ viewport: { width: 390, height: 844 } });
test('respektiert reduzierte Bewegung ohne automatische Kamerafahrt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const canvas = page.locator('#cafe');
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'still');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await expect(canvas).toHaveAttribute('data-logical-width', '672');
  const position = await canvas.getAttribute('data-camera-x');
  await page.getByTestId('enter').click();
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-camera-x', position ?? '0.0');
});

test('lässt die Einstiegskarte stehen und blendet Controls erst nach dem Eintritt aus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.goto('/');
  const welcome = page.getByTestId('welcome');
  const controls = page.getByTestId('controls');

  await page.waitForTimeout(2_700);
  await expect(welcome).toBeVisible();
  await expect(controls).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-ui-idle', 'false');

  await page.getByTestId('enter').click();
  await expect(controls).toBeVisible();
  await page.waitForTimeout(2_700);
  await expect(page.locator('body')).toHaveAttribute('data-ui-idle', 'true');
  await expect(controls).toBeHidden();

  await page.mouse.move(20, 20);
  await expect(page.locator('body')).toHaveAttribute('data-ui-idle', 'false');
  await expect(controls).toBeVisible();

  await page.waitForTimeout(2_700);
  // Eine Tastatureingabe weckt die ausgeblendeten Controls; fokussierte
  // Controls bleiben anschließend dauerhaft sichtbar.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-ui-idle', 'false');
  await page.getByTestId('sound').focus();
  await expect(page.getByTestId('sound')).toBeFocused();
  await expect(controls).toBeVisible();
  await page.waitForTimeout(2_700);
  await expect(controls).toBeVisible();
});

test('synchronisiert Vollbildbutton und Escape mit dem Dokumentzustand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.goto('/');
  await page.getByTestId('enter').click();
  const fullscreen = page.getByTestId('fullscreen');
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');

  await fullscreen.click();
  await expect(page.locator('body')).toHaveAttribute('data-fullscreen', 'true');
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  await expect(fullscreen).toHaveAttribute('aria-label', 'Vollbild verlassen');

  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-fullscreen', 'false');
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await expect(fullscreen).toHaveAttribute('aria-label', 'Vollbild öffnen');
});

test('blendet bei fehlender Fullscreen API nur den Vollbildbutton aus', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
  });
  await page.goto('/');
  await page.getByTestId('enter').click();

  await expect(page.getByTestId('controls')).toBeVisible();
  await expect(page.getByTestId('sound')).toBeVisible();
  await expect(page.getByTestId('fullscreen')).toBeHidden();
});

for (const scenario of [
  { kind: 'tray-drop', message: /Tablett heruntergefallen/ },
  { kind: 'coffee-spill', message: /Kaffee verschüttet/ },
  { kind: 'umbrella-pop', message: /Regenschirm.*aufgegangen/ },
] as const) {
  test(`zeigt ${scenario.kind} beschleunigt und kündigt es einmal an`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/?accident=${scenario.kind}&time=12:30&weather=rain`);
    await page.getByTestId('enter').click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-accident', scenario.kind, { timeout: 5_000 });
    await expect(canvas).toHaveAttribute('data-accident-phase', /startle|chaos|cleanup/);
    await expect(page.locator('#status')).toHaveText(scenario.message);
    expect(errors).toEqual([]);
  });
}

for (const scenario of [
  { kind: 'sketchbook', message: /Mara schlägt ihr abgewetztes Skizzenbuch/i, regular: 'mara' },
  { kind: 'first-date', message: /Noor und Toni teilen sich zaghaft/i, regular: 'noor,toni' },
  { kind: 'knit-gift', message: /Linn legt jemandem gegenüber/i, regular: 'linn' },
] as const) {
  test(`zeigt die Stammgast-Geschichte ${scenario.kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/?story=${scenario.kind}&time=20:30&weather=rain`);
    await page.getByTestId('enter').click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-story', scenario.kind, { timeout: 5_000 });
    await expect(canvas).toHaveAttribute('data-story-step', '1');
    await expect(canvas).toHaveAttribute('data-regulars', new RegExp(scenario.regular));
    await expect(page.locator('#status')).toHaveText(scenario.message);
  });
}

test('zeigt Sora und Kais Arcade-Revanche mit der ausgewählten Venue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.goto('/?story=arcade-rivals&time=12:30&weather=clear');
  await page.getByRole('radio', { name: /Arcade/i }).click();
  await page.getByRole('button', { name: 'Arcade-Halle betreten' }).click();

  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-venue', 'arcade');
  await expect(canvas).toHaveAttribute('data-story', 'arcade-rivals', { timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-moment', 'arcade-duel');
  await expect(canvas).toHaveAttribute('data-regulars', /sora,kai/);
  await expect(page.locator('#status')).toHaveText(/Sora und Kai.*Revanche/i);
});

test('zeigt einen beschleunigten Unfall auch bei reduzierter Bewegung', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?accident=coffee-spill&time=12:30&weather=rain');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');

  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await expect(canvas).toHaveAttribute('data-accident', 'coffee-spill', { timeout: 5_000 });
  await expect(page.locator('#status')).toHaveText(/Kaffee verschüttet/);
});

for (const scenario of [
  { kind: 'shared-cake', message: /Stück Kuchen/ },
  { kind: 'card-game', message: /Kartenrunde/ },
  { kind: 'window-gaze', message: /Wetter draußen/ },
  { kind: 'sketch-reveal', message: /Skizze/ },
] as const) {
  test(`zeigt den beschleunigten Café-Moment ${scenario.kind}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/?moment=${scenario.kind}&time=12:30&weather=rain`);
    await page.getByTestId('enter').click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-moment', scenario.kind, { timeout: 5_000 });
    await expect(page.locator('#status')).toHaveText(scenario.message);
    expect(errors).toEqual([]);
  });
}

for (const scenario of [
  { kind: 'coffee-tasting', venue: 'Café', entry: 'Café betreten', query: 'time=12:30&weather=clear', message: /Kaffeeverkostung/i },
  { kind: 'ramen-slurp', venue: 'Ramen', entry: 'Ramen-Restaurant betreten', query: 'time=20:30&weather=rain', message: /Ramen-Schüssel/i },
  { kind: 'arcade-duel', venue: 'Arcade', entry: 'Arcade-Halle betreten', query: 'time=20:30&weather=rain', message: /Arcade-Runde/i },
  { kind: 'arcade-high-score', venue: 'Arcade', entry: 'Arcade-Halle betreten', query: 'time=20:30&weather=rain', message: /Highscore/i },
  { kind: 'umbrella-handoff', venue: 'Café', entry: 'Café betreten', query: 'time=20:30&weather=rain', message: /Schirm zusammen/i },
] as const) {
  test(`zeigt den ortsabhängigen Moment ${scenario.kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.goto(`/?moment=${scenario.kind}&${scenario.query}`);
    if (scenario.venue !== 'Café') await page.getByRole('radio', { name: new RegExp(scenario.venue) }).click();
    await page.getByRole('button', { name: scenario.entry }).click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-moment', scenario.kind, { timeout: 5_000 });
    await expect(page.locator('#status')).toHaveText(scenario.message);
  });
}

const openMeteoPayload = {
  current: {
    time: '2026-07-14T12:30',
    weather_code: 63,
    cloud_cover: 84,
    temperature_2m: 12.8,
    precipitation: 2.6,
    rain: 2.1,
    showers: 0.5,
    snowfall: 0,
    wind_speed_10m: 24,
    wind_direction_10m: 238,
    wind_gusts_10m: 43,
    is_day: 1,
  },
};

test('verwendet freigegebenen Standort für gerundetes Live-Wetter', async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 59.913_868, longitude: 10.752_245 });
  let requestedUrl = '';
  await page.route('**/api.open-meteo.com/v1/forecast?**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({ json: openMeteoPayload });
  });
  await page.goto('/?time=12:30');
  const body = page.locator('body');
  const canvas = page.locator('#cafe');

  await expect(body).toHaveAttribute('data-location-state', 'granted');
  await expect(body).toHaveAttribute('data-weather-source', 'live');
  await expect(body).toHaveAttribute('data-weather', 'rain');
  await expect(canvas).toHaveAttribute('data-local-time', '12:30');
  await expect(canvas).toHaveAttribute('data-crowd-target', '8');
  expect(requestedUrl).toContain('latitude=59.91');
  expect(requestedUrl).toContain('longitude=10.75');
});

test('bleibt nach Standortablehnung in der deterministischen Ersatzumgebung', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1 } as GeolocationPositionError),
      },
    });
  });
  await page.goto('/?time=07:30');
  await expect(page.locator('body')).toHaveAttribute('data-location-state', 'denied');
  await expect(page.locator('body')).toHaveAttribute('data-weather-source', 'fallback');
  await expect(page.locator('#status')).toContainText(/Ersatzumgebung/);
});

test('behält bei Offline-Wetter eine funktionierende Standortszene', async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 59.91, longitude: 10.75 });
  await page.route('**/api.open-meteo.com/v1/forecast?**', (route) => route.abort('internetdisconnected'));
  await page.goto('/?time=16:30');
  await expect(page.locator('body')).toHaveAttribute('data-location-state', 'granted');
  await expect(page.locator('body')).toHaveAttribute('data-weather-source', 'fallback');
  await expect(page.locator('#status')).toContainText(/Live-Wetter/);
  await expect(page.locator('#cafe')).toHaveAttribute('data-crowd-target', /[3-4]/);
});

for (const scene of [
  { query: 'time=07:30&weather=rain', phase: 'morning', weather: 'rain', crowd: '6' },
  { query: 'time=12:30&weather=clear', phase: 'midday', weather: 'clear', crowd: '8' },
  { query: 'time=20:30&weather=storm', phase: 'dusk', weather: 'storm', crowd: '1' },
  { query: 'time=23:30&weather=snow', phase: 'night', weather: 'snow', crowd: '0' },
] as const) {
  test(`stellt die Entwicklungsszene ${scene.phase}/${scene.weather} ohne Konsolenfehler dar`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?${scene.query}`);
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-day-phase', scene.phase);
    await expect(canvas).toHaveAttribute('data-weather', scene.weather);
    await expect(canvas).toHaveAttribute('data-weather-source', 'override');
    await expect(canvas).toHaveAttribute('data-crowd-target', scene.crowd);
    await expect(canvas).toHaveAttribute('data-clock', 'analog');
    await expect(canvas).toHaveAttribute('data-clock-time', scene.query.slice(5, 10));
    expect(errors).toEqual([]);
  });
}

test('zeigt Wetter und Uhr bei Reduced Motion statisch vollständig an', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?time=20:30&weather=storm');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await expect(canvas).toHaveAttribute('data-weather', 'storm');
  await expect(canvas).toHaveAttribute('data-clock-time', '20:30');
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
});
