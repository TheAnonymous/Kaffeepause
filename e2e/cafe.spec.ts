import { expect, test, type Page } from '@playwright/test';

function qualityUrl(path: string, tier: 'master' | 'balanced' | 'fallback'): string {
  const url = new URL(path, 'http://kaffeepause.test');
  url.searchParams.set('quality', tier);
  url.searchParams.set('testRender', 'diagnostic');
  return `${url.pathname}${url.search}`;
}

async function renderVisualFrame(page: Page): Promise<void> {
  const canvas = page.locator('#cafe');
  const previous = Number(await canvas.getAttribute('data-visual-render-count'));
  await page.evaluate(() => {
    (window as typeof window & { renderDioramaVisualFrame?: () => void }).renderDioramaVisualFrame?.();
  });
  await expect.poll(async () => Number(await canvas.getAttribute('data-visual-render-count')))
    .toBeGreaterThan(previous);
}

async function pauseBeforeEntry(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & { setDioramaPaused?: (paused: boolean) => void }).setDioramaPaused?.(true);
  });
}

async function stepDiagnosticFrames(page: Page, count: number, deltaSeconds = 0.1): Promise<void> {
  await page.evaluate(({ frameCount, delta }) => {
    const testWindow = window as typeof window & { stepDioramaDiagnosticFrame?: (deltaSeconds?: number) => void };
    for (let frame = 0; frame < frameCount; frame += 1) testWindow.stepDioramaDiagnosticFrame?.(delta);
  }, { frameCount: count, delta: deltaSeconds });
}

async function openCafe(page: Page, path = '/', tier: 'master' | 'balanced' | 'fallback' = 'fallback'): Promise<void> {
  await page.goto(qualityUrl(path, tier));
  await expect(page.locator('#cafe')).toHaveAttribute('data-renderer-state', 'ready', { timeout: 15_000 });
}

async function reactionTarget(page: Page, preferredId?: string): Promise<{ id: string; x: number; y: number }> {
  const canvas = page.locator('#cafe');
  await expect.poll(async () => await canvas.getAttribute('data-reaction-targets')).toMatch(/.+:\d+,-?\d+/);
  const raw = await canvas.getAttribute('data-reaction-targets') ?? '';
  const targets = raw.split('|').map((entry) => {
    const match = entry.match(/^(.+):(-?\d+),(-?\d+)$/);
    return match ? { id: match[1] ?? '', x: Number(match[2]), y: Number(match[3]) } : undefined;
  }).filter((target): target is { id: string; x: number; y: number } => target !== undefined);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const visible = targets.filter((entry) => entry.x >= 0 && entry.x <= viewport.width && entry.y >= 0 && entry.y <= viewport.height);
  const preferred = visible.find((entry) => entry.id === preferredId);
  const target = preferred ?? [...visible].sort((left, right) => (
    Math.hypot(left.x - viewport.width / 2, left.y - viewport.height / 2)
      - Math.hypot(right.x - viewport.width / 2, right.y - viewport.height / 2)
  ))[0];
  if (!target) throw new Error('Kein Reaktionsziel im Canvas veröffentlicht.');
  return target;
}

async function moveToReactionTarget(page: Page, preferredId?: string): Promise<{ id: string; x: number; y: number }> {
  const canvas = page.locator('#cafe');
  await expect.poll(async () => await canvas.getAttribute('data-reaction-targets')).toMatch(/.+:\d+,-?\d+/);
  return canvas.evaluate((element, preferred) => {
    const targets = (element.dataset.reactionTargets ?? '').split('|').map((entry) => {
      const match = entry.match(/^(.+):(-?\d+),(-?\d+)$/);
      return match ? { id: match[1] ?? '', x: Number(match[2]), y: Number(match[3]) } : undefined;
    }).filter((target): target is { id: string; x: number; y: number } => target !== undefined)
      .filter((target) => target.x >= 0 && target.x <= window.innerWidth && target.y >= 0 && target.y <= window.innerHeight);
    const target = targets.find((entry) => entry.id === preferred)
      ?? [...targets].sort((left, right) => (
        Math.hypot(left.x - window.innerWidth / 2, left.y - window.innerHeight / 2)
          - Math.hypot(right.x - window.innerWidth / 2, right.y - window.innerHeight / 2)
      ))[0];
    if (!target) throw new Error('Kein sichtbares Reaktionsziel im Canvas veröffentlicht.');
    element.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerType: 'mouse', clientX: target.x, clientY: target.y,
    }));
    return target;
  }, preferredId);
}

async function expectFocusFraming(
  page: Page,
  source: 'conversation' | 'story' | 'accident' | 'moment' | 'reaction',
  expectOccluder = false,
): Promise<void> {
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', source, { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-focus-light', /^(?!off$).+/);
  await expect(canvas).toHaveAttribute('data-camera-focus-target', /^\d+\.\d,-?\d+\.\d,\d+\.\d{2}$/);
  await expect(canvas).toHaveAttribute('data-focus-participants', /^(?!none$).+/);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-focus-fov'))).toBeLessThanOrEqual(30.01);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-focus-fov'))).toBeGreaterThanOrEqual(19.99);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-focus-amount'))).toBeGreaterThan(0.7);
  if (expectOccluder) {
    await expect(canvas).toHaveAttribute('data-focus-occluders', /^(?!none$).+/);
    await expect.poll(async () => Number(await canvas.getAttribute('data-focus-occluder-opacity'))).toBeLessThanOrEqual(0.49);
  } else {
    await expect(canvas).toHaveAttribute('data-focus-occluders', /^(none|.+)$/);
    await expect.poll(async () => Number(await canvas.getAttribute('data-focus-occluder-opacity'))).toBeGreaterThanOrEqual(0.48);
  }
  await expect(canvas).toHaveAttribute('data-visible-emotes', /^(?!none$).+/);
  await expect(canvas).toHaveAttribute('data-focus-bounds', /^-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3}$/);
  await expect(canvas).toHaveAttribute('data-focus-safe', 'true');
}

async function expectFocusRestoredByReducedMotion(page: Page): Promise<void> {
  const canvas = page.locator('#cafe');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(canvas).toHaveAttribute('data-camera-focus', 'none');
  await expect(canvas).toHaveAttribute('data-focus-occluders', 'none');
  await expect(canvas).toHaveAttribute('data-focus-occluder-opacity', '1.00');
  await expect(canvas).toHaveAttribute('data-focus-bounds', 'none');
  await expect(canvas).toHaveAttribute('data-focus-safe', 'true');
  await expect(canvas).toHaveAttribute('data-visible-emotes', /\+/);
}

test('initialisiert den 6×-Masterrenderer mit vollständigen Qualitätsmetadaten', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear', 'master');
  await expect(page).toHaveTitle('Kaffeepause');
  await expect(page).toHaveURL(/time=12%3A30.*weather=clear.*quality=master/);
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
  await expect(canvas).toHaveAttribute('data-speech-language', 'symbolic-emotes');
  await expect(canvas).toHaveAttribute('data-speech-bubble-resolution', '128x96');
  await expect(canvas).toHaveAttribute('data-navigation', 'collision-aware');
  await expect(canvas).toHaveAttribute('data-navigation-status', 'clear');
  await expect(canvas).toHaveAttribute('data-navigation-deadlocks', '0');
  await expect(canvas).toHaveAttribute('data-living-direction', 'idle');
  await expect(canvas).toHaveAttribute('data-living-route', 'none');
  await expect(canvas).toHaveAttribute('data-living-completed', '0');
  await expect(canvas).toHaveAttribute('data-proportion-check', 'pass');
  await expect(canvas).toHaveAttribute('data-layout-score', '100');
  await expect(canvas).toHaveAttribute('data-venue-layout', 'cafe');
  await expect(canvas).toHaveAttribute('data-entry-flow', 'left');
  await expect(canvas).toHaveAttribute('data-layout-capacity', '4-6');
  await expect(canvas).toHaveAttribute('data-layout-check', 'pass');
  await expect(canvas).toHaveAttribute('data-activity-spots', /cafe-window-a:bench:seated/);
  await expect(canvas).toHaveAttribute('data-passing-places', /cafe-pass-middle/);
  await expect(canvas).toHaveAttribute('data-living-routes', /cafe-window-to-pastry/);
  await expect(canvas).toHaveAttribute('data-golden-living-sequence', 'cafe-window-to-pastry');
  await expect(canvas).toHaveAttribute('data-scale-model', '32px-adult');
  await expect(canvas).toHaveAttribute('data-character-variation', '12-silhouettes');
  await expect(canvas).toHaveAttribute('data-character-diversity', '100');
  await expect(canvas).toHaveAttribute('data-character-frame-rate', '6');
  await expect(canvas).toHaveAttribute('data-session-act', 'arrival');
  await expect(canvas).toHaveAttribute('data-camera-phase', 'overview');
  await expect(canvas).toHaveAttribute('data-selective-bloom', 'half-res-registered');
  await expect(canvas).toHaveAttribute('data-character-bloom', 'excluded');
  await expect(canvas).toHaveAttribute('data-art-assets', 'ready', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-art-pack', /^v6-cafe-/);
  await expect(canvas).toHaveAttribute('data-atmosphere-assets', 'ready', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-texture-bytes', '94616');
  await expect(canvas).toHaveAttribute('data-atmosphere-wave', 'none');
  await expect(canvas).toHaveAttribute('data-atmosphere-phase', 'idle');
  await expect(canvas).toHaveAttribute('data-atmosphere-zone', 'none');
  await expect(canvas).toHaveAttribute('data-atmosphere-intensity', '0.000');
  await expect(canvas).toHaveAttribute('data-audio-layers', /music-electric-piano/);
  await renderVisualFrame(page);
  await expect.poll(async () => Number(await canvas.getAttribute('data-draw-calls'))).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-bloom-surfaces', /[1-9]\d*/);
  await expect(canvas).toHaveAttribute('data-weather-layers', '1-batched');
  await expect(canvas).toHaveAttribute('data-audio-samples', 'idle');
  await expect(canvas).toHaveAttribute('data-emote-bubbles', '0');
  await expect(canvas).toHaveAttribute('data-camera-focus-target', 'none');
  await expect(canvas).toHaveAttribute('data-camera-focus-fov', '30.00');
  await expect(canvas).toHaveAttribute('data-camera-focus-amount', '0.00');
  await expect(canvas).toHaveAttribute('data-focus-participants', 'none');
  await expect(canvas).toHaveAttribute('data-focus-occluders', 'none');
  await expect(canvas).toHaveAttribute('data-focus-occluder-opacity', '1.00');
  await expect(canvas).toHaveAttribute('data-visible-emotes', 'none');
  await expect(canvas).toHaveAttribute('data-visual-profile', 'cafe');
  await expect(canvas).toHaveAttribute('data-surface-textures', '7');
  await expect(canvas).toHaveAttribute('data-focus-bounds', 'none');
  await expect(canvas).toHaveAttribute('data-focus-safe', 'true');
  await expect(canvas).toHaveAttribute('data-exposure', '1.25');
  await expect(canvas).toHaveAttribute('data-character-emissive', '0.05');
  await expect(canvas).toHaveAttribute('data-shadow-lift', '0.06');
  await expect(canvas).toHaveAttribute('data-saturation', '0.98');
  expect(await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return { width: target.width, height: target.height };
  }))
    .toEqual({ width: 2304, height: 1296 });
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 1440, height: 810 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual({ width: 1440, height: 810 });

  await expect(canvas).toHaveAttribute('data-quality-tier', 'master');
  await expect(canvas).toHaveAttribute('data-renderer-state', 'ready');
  await expect(canvas).toHaveAttribute('data-render-loop', 'single-frame');
  expect(errors).toEqual([]);
});

test('initialisiert auch das ausgewogene Qualitätsprofil vollständig', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear', 'balanced');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-quality-tier', 'balanced');
  await expect(canvas).toHaveAttribute('data-logical-width', '1536');
  await expect(canvas).toHaveAttribute('data-render-scale', '4');
  await expect(canvas).toHaveAttribute('data-shadow-map-size', '1024');
  await expect(canvas).toHaveAttribute('data-bloom-pass', 'reduced');
  await expect(canvas).toHaveAttribute('data-miniature-blur', 'full');
  await expect(canvas).toHaveAttribute('data-character-frame-rate', '4');
});

test('hält die V4-Ressourcenbudgets gemeinsam für alle Orte ein', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear', 'master');
  const canvas = page.locator('#cafe');
  const drawCallBudgets: Readonly<Record<VisualVenue, number>> = { cafe: 220, ramen: 130, arcade: 165 };

  for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
    await chooseVenue(page, venue);
    await renderVisualFrame(page);
    const metrics = await canvas.evaluate((element) => ({
      drawCalls: Number(element.dataset.drawCalls),
      geometries: Number(element.dataset.geometries),
      v3GeometryBaseline: Number(element.dataset.v3GeometryBaseline),
      gpuTextures: Number(element.dataset.gpuTextures),
      estimatedTextureBytes: Number(element.dataset.estimatedTextureBytes),
      characterCache: Number(element.dataset.characterCache),
      staticBatches: Number(element.dataset.staticBatches),
      staticInstances: Number(element.dataset.staticInstances),
      renderTargets: Number(element.dataset.renderTargets),
    }));
    expect(metrics.drawCalls, `${venue} draw calls`).toBeLessThanOrEqual(drawCallBudgets[venue]);
    expect(metrics.geometries, `${venue} geometries`)
      .toBeLessThanOrEqual(Math.floor(metrics.v3GeometryBaseline * 0.6));
    expect(metrics.characterCache, `${venue} character cache`).toBeLessThanOrEqual(64);
    expect(metrics.estimatedTextureBytes, `${venue} estimated texture bytes`).toBeLessThan(64 * 1024 * 1024);
    expect(metrics.gpuTextures, `${venue} WebGL textures`).toBeGreaterThan(0);
    expect(metrics.staticBatches, `${venue} static batches`).toBeGreaterThan(0);
    expect(metrics.staticInstances, `${venue} static instances`).toBeGreaterThan(metrics.staticBatches);
    expect(metrics.renderTargets, `${venue} render targets`).toBe(4);
  }
});

test('startet mobil adaptiv in Balanced und hält das 32-MiB-Texturbudget', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?time=12%3A30&weather=clear&testRender=diagnostic');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-renderer-state', 'ready', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-quality-tier', 'balanced');
  await expect(canvas).toHaveAttribute('data-quality-reason', 'initial-mobile-balanced');
  await expect(canvas).toHaveAttribute('data-bloom-resolution', /^quarter:/);
  await renderVisualFrame(page);
  await expect.poll(async () => Number(await canvas.getAttribute('data-estimated-texture-bytes')))
    .toBeLessThan(32 * 1024 * 1024);
});

test('entsorgt Figuren- und Art-Texturen bei Kontextverlust und stellt den Ort wieder her', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear', 'master');
  await chooseVenue(page, 'cafe');
  const canvas = page.locator('#cafe');
  await renderVisualFrame(page);
  await expect.poll(async () => Number(await canvas.getAttribute('data-character-cache'))).toBeGreaterThan(0);

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(canvas).toHaveAttribute('data-art-assets', 'failed');
  await expect(canvas).toHaveAttribute('data-art-pack', 'procedural-context-fallback');
  await expect(canvas).toHaveAttribute('data-character-cache', '0');

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextrestored'));
  });
  await expect(canvas).toHaveAttribute('data-art-assets', 'ready', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-art-pack', /^v6-cafe-/);
});

test('kehrt nach beschleunigten Figuren-, Moment-, Atlas- und Ortswechseln zum Ressourcenstand zurück', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 810 });
  await installFramePause(page);
  await openCafe(page, '/?moment=shared-cake&cinematicScale=0.02&time=12:30&weather=clear', 'master');
  await chooseVenue(page, 'cafe');
  await pauseBeforeEntry(page);
  await page.getByTestId('enter').click();
  await stepDiagnosticFrames(page, 6, 0.1);
  await renderVisualFrame(page);
  const canvas = page.locator('#cafe');
  const resourceSnapshot = () => canvas.evaluate((element) => ({
    geometries: Number(element.dataset.geometries),
    gpuTextures: Number(element.dataset.gpuTextures),
    renderTargets: Number(element.dataset.renderTargets),
  }));
  const cycleVenues = async (venues: readonly VisualVenue[]) => {
    for (const venue of venues) {
      await page.evaluate((nextVenue) => {
        (window as typeof window & { setDioramaDiagnosticVenue?: (venue: VisualVenue) => void })
          .setDioramaDiagnosticVenue?.(nextVenue);
      }, venue);
      await expect(canvas).toHaveAttribute('data-art-pack', new RegExp(`^v6-${venue}-`), { timeout: 15_000 });
      await stepDiagnosticFrames(page, 2, 0);
      await renderVisualFrame(page);
      await expect.poll(async () => Number(await canvas.getAttribute('data-character-cache'))).toBeLessThanOrEqual(64);
    }
  };

  // Establish a first-use high-water mark before checking that repeated cycles release back to it.
  await cycleVenues(['ramen', 'arcade', 'cafe']);
  const initial = await resourceSnapshot();
  await cycleVenues(['ramen', 'arcade', 'cafe', 'arcade', 'ramen', 'cafe']);

  expect(await resourceSnapshot()).toEqual(initial);
});

test('betritt das Café auf fallback und schaltet den Ton', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-quality-tier', 'fallback');
  await expect(canvas).toHaveAttribute('data-render-scale', '3');
  await expect(canvas).toHaveAttribute('data-character-frame-rate', '3');
  await expect(canvas).toHaveAttribute('data-selective-bloom', 'fallback-off');
  await page.getByTestId('enter').evaluate((button) => {
    button.addEventListener('click', () => document.querySelector<HTMLElement>('[data-testid="sound"]')?.focus(), { once: true });
  });
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
  await expect(canvas).toHaveAttribute('data-render-loop', 'running');
  if (await sound.isEnabled()) {
    await expect(canvas).toHaveAttribute('data-audio-samples', /ready|partial/, { timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});

test('fällt bei einem fehlenden Ortspaket geräuschlos auf prozedurales Audio zurück', async ({ page }) => {
  await page.route('**/audio/cafe/**', async (route) => route.fulfill({ status: 404, body: '' }));
  await openCafe(page, '/?time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const sound = page.getByTestId('sound');
  await expect(sound).toHaveAttribute('data-audio-state', /playing|unavailable/);
  if (await sound.isEnabled()) {
    await expect(page.locator('#cafe')).toHaveAttribute('data-audio-samples', 'fallback', { timeout: 15_000 });
  }
});

for (const venue of [
  { kind: 'ramen', label: 'Ramen', entry: 'Ramen-Restaurant betreten', canvas: /Ramen-Restaurant/i, frame: 'rgb(224, 96, 79)', flow: 'right', capacity: '5-7', spot: /ramen-counter-1:counter-stool:seated/ },
  { kind: 'arcade', label: 'Arcade', entry: 'Arcade-Halle betreten', canvas: /Arcade-Halle/i, frame: 'rgb(92, 218, 224)', flow: 'rear', capacity: '4-7', spot: /arcade-left-1:arcade-cabinet:standing/ },
] as const) {
  test(`wechselt vor dem Eintritt in die ${venue.kind}-Szene`, async ({ page }) => {
    await openCafe(page, '/?time=20:30&weather=rain');
    await page.getByRole('radio', { name: new RegExp(venue.label) }).click();

    const canvas = page.locator('#cafe');
    await expect(page.locator('body')).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAttribute('data-visual-profile', venue.kind);
    await expect(canvas).toHaveAttribute('data-surface-textures', '7');
    await expect(canvas).toHaveAttribute('data-venue-layout', venue.kind);
    await expect(canvas).toHaveAttribute('data-entry-flow', venue.flow);
    await expect(canvas).toHaveAttribute('data-layout-capacity', venue.capacity);
    await expect(canvas).toHaveAttribute('data-layout-check', 'pass');
    await expect(canvas).toHaveAttribute('data-activity-spots', venue.spot);
    await expect(canvas).toHaveAccessibleName(venue.canvas);
    await expect(page.getByRole('button', { name: venue.entry })).toBeVisible();
    await expect(page.locator('.welcome__card')).toHaveCSS('border-color', venue.frame);

    await page.getByRole('button', { name: venue.entry }).click();
    await expect(page.locator('body')).toHaveAttribute('data-entered', 'true');
    await expect(canvas).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAttribute('data-occupied-spots', /^(?!none$).+/);
  });
}

test('veröffentlicht vollständige Sitzdiagnosen für alle drei Orte', async ({ page }) => {
  await openCafe(page, '/?time=12:30&weather=clear');
  const canvas = page.locator('#cafe');
  for (const venue of [
    { kind: 'cafe', label: 'Café', bindings: '6' },
    { kind: 'ramen', label: 'Ramen', bindings: '7' },
    { kind: 'arcade', label: 'Arcade', bindings: '1' },
  ] as const) {
    if (venue.kind !== 'cafe') await page.getByRole('radio', { name: new RegExp(venue.label) }).click();
    await expect(canvas).toHaveAttribute('data-venue', venue.kind);
    await expect(canvas).toHaveAttribute('data-seat-alignment', 'pass');
    await expect(canvas).toHaveAttribute('data-seat-bindings', venue.bindings);
  }
});

test('bedient die Ortswahl als vollständige Tastatur-Radiogruppe', async ({ page }) => {
  await openCafe(page);
  const cafe = page.getByRole('radio', { name: /Café/ });
  const ramen = page.getByRole('radio', { name: /Ramen/ });
  const arcade = page.getByRole('radio', { name: /Arcade/ });

  await cafe.focus();
  await page.keyboard.press('ArrowRight');
  await expect(ramen).toBeFocused();
  await expect(ramen).toHaveAttribute('aria-checked', 'true');
  await expect(cafe).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(arcade).toBeFocused();
  await expect(arcade).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(cafe).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(arcade).toBeFocused();
  await expect(arcade).toHaveAttribute('aria-checked', 'true');
});

test('zeigt während der verzögerten Initialisierung einen beschäftigten Eintritt', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { runRendererPreparation?: () => void };
    window.requestIdleCallback = (callback: IdleRequestCallback): number => {
      target.runRendererPreparation = () => callback({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    };
  });
  await page.goto(qualityUrl('/', 'fallback'));
  const canvas = page.locator('#cafe');
  const enter = page.getByTestId('enter');
  await expect(canvas).toHaveAttribute('data-renderer-state', 'loading');
  await expect(enter).toBeDisabled();
  await expect(enter).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Das Diorama wird vorbereitet …')).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { runRendererPreparation?: () => void }).runRendererPreparation?.();
  });
  await expect(canvas).toHaveAttribute('data-renderer-state', 'ready');
  await expect(enter).toBeEnabled();
  await expect(enter).not.toHaveAttribute('aria-busy', 'true');
});

test('behält bei einem WebGL-Fehler die Karte und ermöglicht einen Retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let rejectWebgl = true;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ): RenderingContext | null {
      if (rejectWebgl && contextId.startsWith('webgl')) return null;
      return original.call(this, contextId as '2d', ...args as [CanvasRenderingContext2DSettings]);
    } as typeof HTMLCanvasElement.prototype.getContext;
    (window as typeof window & { allowWebgl?: () => void }).allowWebgl = () => { rejectWebgl = false; };
  });
  await page.goto(qualityUrl('/', 'fallback'));
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-renderer-state', 'failed');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByText(/konnte nicht geladen werden/)).toBeVisible();
  const retry = page.getByTestId('renderer-retry');
  await expect(retry).toBeVisible();
  await page.evaluate(() => (window as typeof window & { allowWebgl?: () => void }).allowWebgl?.());
  await retry.click();
  await expect(canvas).toHaveAttribute('data-renderer-state', 'ready');
  await expect(page.getByTestId('enter')).toBeEnabled();
});

test('rendert vor Eintritt nur einzeln und pausiert den Loop in versteckten Tabs', async ({ page }) => {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as typeof window & { setTestHidden?: (value: boolean) => void }).setTestHidden = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    });
  });
  await openCafe(page);
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-render-loop', 'single-frame');
  const idleCount = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-render-count', String(idleCount));

  await page.getByTestId('enter').click();
  await expect(canvas).toHaveAttribute('data-render-loop', 'running');
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(idleCount);
  await page.evaluate(() => (window as typeof window & { setTestHidden?: (value: boolean) => void }).setTestHidden?.(true));
  await expect(canvas).toHaveAttribute('data-render-loop', 'paused');
  const pausedCount = Number(await canvas.getAttribute('data-render-count'));
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-render-count', String(pausedCount));
  await page.evaluate(() => (window as typeof window & { setTestHidden?: (value: boolean) => void }).setTestHidden?.(false));
  await expect(canvas).toHaveAttribute('data-render-loop', 'running');
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(pausedCount);
});

test('wechselt bei schmalem Resize in die ruhige Kamerafahrt', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await openCafe(page);
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-logical-width', '1152');
  await expect(canvas).toHaveAttribute('data-scene-width', '384');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute('data-camera-mode', 'tour');
  await expect(canvas).toHaveAttribute('data-logical-width', '336');
  await expect(canvas).toHaveAttribute('data-scene-width', '112');
  expect(await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return { width: target.width, height: target.height };
  }))
    .toEqual({ width: 336, height: 648 });
  const bounds = await canvas.boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })))
    .toEqual({ width: 390, height: 844 });
});

test.use({ viewport: { width: 390, height: 844 } });
test('respektiert reduzierte Bewegung ohne automatische Kamerafahrt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCafe(page);
  const canvas = page.locator('#cafe');
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(canvas).toHaveAttribute('data-camera-mode', 'still');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await expect(canvas).toHaveAttribute('data-logical-width', '336');
  const position = await canvas.getAttribute('data-camera-x');
  await page.getByTestId('enter').click();
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-camera-x', position ?? '0.0');
});

for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
  test(`hält ${venue} mobil mit Reduced Motion layouttreu und statisch`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCafe(page, '/?time=20:30&weather=rain');
    if (venue !== 'cafe') await page.getByRole('radio', { name: new RegExp(venue, 'i') }).click();
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-venue-layout', venue);
    await expect(canvas).toHaveAttribute('data-layout-check', 'pass');
    await expect(canvas).toHaveAttribute('data-camera-mode', 'still');
    await expect(canvas).toHaveAttribute('data-particles', 'low');
    await page.getByTestId('enter').click();
    await expect(canvas).toHaveAttribute('data-occupied-spots', /^(?!none$).+/);
  });
}

test('reagiert nach Mausverweildauer genau einmal mit Emote, Fokus und leisem Akzent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'conversation', { timeout: 5_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('sound')).toHaveAttribute('data-audio-state', /playing|unavailable/);
  const target = await moveToReactionTarget(page, 'guest-1');

  await expect(canvas).toHaveAttribute('data-pointer-hit', target.id);
  await expect(canvas).toHaveAttribute('data-reacting-character', target.id, { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-reaction', /wave|nod|laugh/);
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'reaction');
  await expect(canvas).toHaveAttribute('data-emote-bubbles', /[1-2]/);
  const token = await canvas.getAttribute('data-reaction-token');
  expect(Number(token)).toBeGreaterThan(0);
  if (await page.getByTestId('sound').getAttribute('data-audio-state') === 'playing') {
    await expect(canvas).toHaveAttribute('data-reaction-audio-gain', '0.008');
  }
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-reaction-token', token ?? '1');
});

test('ignoriert Touch- und Stiftbewegungen für Figurenreaktionen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const target = await reactionTarget(page, 'barista');
  await page.locator('#cafe').evaluate((canvas, point) => {
    for (const pointerType of ['touch', 'pen']) {
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerType, clientX: point.x, clientY: point.y,
      }));
    }
  }, target);
  await page.waitForTimeout(500);
  await expect(page.locator('#cafe')).toHaveAttribute('data-reacting-character', 'none');
});

test('fokussiert ein normales Gespräch höchstens als ruhige Gesprächsszene', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'conversation', { timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-camera-focus', 'active');
});

test('lässt Geschichten den Mausfokus überstimmen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?story=order-mixup&time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-story', 'order-mixup', { timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'story');
  const target = await moveToReactionTarget(page, 'guest-5');
  await expect(canvas).toHaveAttribute('data-reacting-character', target.id, { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'story');
});

test('deaktiviert Fokusfahrten bei Reduced Motion vollständig', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCafe(page, '/?story=order-mixup&time=12:30&weather=clear');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-story', 'order-mixup', { timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-camera-focus', 'none');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'none');
});

test('pausiert die mobile Tour während eines Fokus und setzt sie danach fort', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCafe(page, '/?time=12:30&weather=clear&cinematicScale=0.2');
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await moveToReactionTarget(page, 'guest-1');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'reaction', { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-mobile-tour-paused', 'true');
  await expect(canvas).toHaveAttribute('data-camera-focus-source', 'none', { timeout: 13_000 });
  await expect(canvas).toHaveAttribute('data-mobile-tour-paused', 'false');
});

for (const scenario of [
  { source: 'conversation', path: '/?time=12:30&weather=clear', venue: 'cafe', reaction: false },
  { source: 'story', path: '/?story=noodle-mishap&time=20:30&weather=rain', venue: 'ramen', reaction: false },
  { source: 'accident', path: '/?accident=coffee-spill&time=12:30&weather=rain', venue: 'cafe', reaction: false },
  { source: 'moment', path: '/?moment=shared-cake&time=12:30&weather=clear', venue: 'cafe', reaction: false },
  { source: 'reaction', path: '/?time=22:00&weather=clear', venue: 'arcade', reaction: true },
] as const) {
  test(`rahmt ${scenario.source} räumlich, blendet nur Sichtblocker ab und stellt sie nach Abbruch wieder her`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 810 });
    await openCafe(page, scenario.path);
    if (scenario.venue !== 'cafe') await page.getByRole('radio', { name: new RegExp(scenario.venue, 'i') }).click();
    await page.getByTestId('enter').click();
    if (scenario.reaction) {
      await expect(page.locator('#cafe')).toHaveAttribute('data-camera-focus-source', 'conversation', { timeout: 5_000 });
      await page.waitForTimeout(1_000);
      await moveToReactionTarget(page, 'guest-1');
    }
    await expectFocusFraming(page, scenario.source, scenario.source === 'conversation' || scenario.source === 'moment');
    await expectFocusRestoredByReducedMotion(page);
  });
}

test('lässt die Einstiegskarte stehen und blendet Controls erst nach dem Eintritt aus', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page);
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
  await page.evaluate(() => {
    document.body.dataset.uiIdle = 'false';
    const sound = document.querySelector<HTMLElement>('[data-testid="sound"]');
    void sound?.offsetWidth;
    sound?.focus();
  });
  await expect(page.getByTestId('sound')).toBeFocused();
  await expect(controls).toBeVisible();
  await page.waitForTimeout(2_700);
  await expect(controls).toBeVisible();
});

test('synchronisiert Vollbildbutton und Escape mit dem Dokumentzustand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page);
  await page.getByTestId('enter').evaluate((button) => {
    button.addEventListener('click', () => document.querySelector<HTMLElement>('[data-testid="fullscreen"]')?.focus(), { once: true });
  });
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
  await openCafe(page);
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
    await openCafe(page, `/?accident=${scenario.kind}&time=12:30&weather=rain`);
    await page.getByTestId('enter').click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-accident', scenario.kind, { timeout: 10_000 });
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
    const time = scenario.kind === 'knit-gift' ? '12:30' : '20:30';
    await openCafe(page, `/?story=${scenario.kind}&time=${time}&weather=rain`);
    await page.getByTestId('enter').click();

    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-story', scenario.kind, { timeout: 10_000 });
    await expect(canvas).toHaveAttribute('data-story-step', '1');
    await expect(canvas).toHaveAttribute('data-regulars', new RegExp(scenario.regular));
    await expect(page.locator('#status')).toHaveText(scenario.message);
  });
}

test('zeigt Sora und Kais Arcade-Revanche mit der ausgewählten Venue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await openCafe(page, '/?story=arcade-rivals&time=12:30&weather=clear');
  await page.getByRole('radio', { name: /Arcade/i }).click();
  await page.getByRole('button', { name: 'Arcade-Halle betreten' }).click();

  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-venue', 'arcade');
  await expect(canvas).toHaveAttribute('data-story', 'arcade-rivals', { timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-moment', 'arcade-duel');
  await expect(canvas).toHaveAttribute('data-regulars', /sora,kai/);
  await expect(page.locator('#status')).toHaveText(/Sora und Kai.*Revanche/i);
});

for (const scenario of [
  { kind: 'order-mixup', venue: 'Café', entry: 'Café betreten', regulars: /bo,cleo/, message: /falschen Getränke/i },
  { kind: 'noodle-mishap', venue: 'Ramen', entry: 'Ramen-Restaurant betreten', regulars: /jun,emi/, message: /lange Nudel/i },
  { kind: 'glitched-coop', venue: 'Arcade', entry: 'Arcade-Halle betreten', regulars: /ari,mika/, message: /flackert.*Automat/i },
] as const) {
  test(`zeigt die dreiteilige Geschichte ${scenario.kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await openCafe(page, `/?story=${scenario.kind}&time=12:30&weather=clear`);
    if (scenario.venue !== 'Café') await page.getByRole('radio', { name: new RegExp(scenario.venue) }).click();
    await page.getByRole('button', { name: scenario.entry }).click();
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-story', scenario.kind, { timeout: 5_000 });
    await expect(canvas).toHaveAttribute('data-story-step', '1');
    await expect(canvas).toHaveAttribute('data-regulars', scenario.regulars);
    await expect(canvas).toHaveAttribute('data-emote-bubbles', /[1-2]/);
    await expect(page.locator('#status')).toHaveText(scenario.message);
  });
}

test('zeigt einen beschleunigten Unfall auch bei reduzierter Bewegung', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCafe(page, '/?accident=coffee-spill&time=12:30&weather=rain');
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
    await openCafe(page, `/?moment=${scenario.kind}&time=12:30&weather=rain`);
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
  { kind: 'foam-moustache', venue: 'Café', entry: 'Café betreten', query: 'time=12:30&weather=clear', message: /Milchschaumbart/i },
  { kind: 'sugar-packet-domino', venue: 'Café', entry: 'Café betreten', query: 'time=12:30&weather=clear', message: /Dominosteine/i },
  { kind: 'steam-glasses', venue: 'Ramen', entry: 'Ramen-Restaurant betreten', query: 'time=20:30&weather=rain', message: /beschlägt eine Brille/i },
  { kind: 'chopstick-drop', venue: 'Ramen', entry: 'Ramen-Restaurant betreten', query: 'time=20:30&weather=clear', message: /Stäbchen fällt/i },
  { kind: 'ticket-stream', venue: 'Arcade', entry: 'Arcade-Halle betreten', query: 'time=20:30&weather=clear', message: /Ticketstreifen/i },
  { kind: 'button-mash-sync', venue: 'Arcade', entry: 'Arcade-Halle betreten', query: 'time=20:30&weather=clear', message: /Arcade-Rhythmus/i },
] as const) {
  test(`zeigt den ortsabhängigen Moment ${scenario.kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await openCafe(page, `/?moment=${scenario.kind}&${scenario.query}`);
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
  await openCafe(page, '/?time=12:30');
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
  await openCafe(page, '/?time=07:30');
  await expect(page.locator('body')).toHaveAttribute('data-location-state', 'denied');
  await expect(page.locator('body')).toHaveAttribute('data-weather-source', 'fallback');
  await expect(page.locator('#status')).toContainText(/Ersatzumgebung/);
});

test('behält bei Offline-Wetter eine funktionierende Standortszene', async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 59.91, longitude: 10.75 });
  await page.route('**/api.open-meteo.com/v1/forecast?**', (route) => route.abort('internetdisconnected'));
  await openCafe(page, '/?time=16:30');
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
    await openCafe(page, `/?${scene.query}`);
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

type VisualVenue = 'cafe' | 'ramen' | 'arcade';
type VisualBeat = 'establishing' | 'detail' | 'reaction';

const visualVenues = [
  { venue: 'cafe', time: '20:30', weather: 'rain' },
  { venue: 'ramen', time: '20:30', weather: 'rain' },
  { venue: 'arcade', time: '22:00', weather: 'clear' },
] as const;

const cinematicBaselines = [
  { venue: 'cafe', story: 'ritual', moment: 'window-rain-trace', time: '20:30', weather: 'rain' },
  { venue: 'cafe', story: 'encounter', moment: 'pencil-return', time: '12:30', weather: 'clear' },
  { venue: 'ramen', story: 'ritual', moment: 'broth-lid-lift', time: '20:30', weather: 'rain' },
  { venue: 'ramen', story: 'encounter', moment: 'condiment-pass', time: '20:30', weather: 'clear' },
  { venue: 'arcade', story: 'ritual', moment: 'attract-mode-wave', time: '22:00', weather: 'clear' },
  { venue: 'arcade', story: 'encounter', moment: 'coop-rescue', time: '22:00', weather: 'clear' },
] as const;

async function installFramePause(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as typeof window & { setDioramaPaused?: (paused: boolean) => void }).setDioramaPaused = (paused) => {
      hidden = paused;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

async function setFramePaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((nextPaused) => {
    (window as typeof window & { setDioramaPaused?: (paused: boolean) => void }).setDioramaPaused?.(nextPaused);
  }, paused);
  await expect(page.locator('#cafe')).toHaveAttribute('data-render-loop', paused ? 'paused' : 'running');
}

async function chooseVenue(page: Page, venue: VisualVenue): Promise<void> {
  if (venue !== 'cafe') await page.locator(`[data-venue-choice="${venue}"]`).click();
  await expect(page.locator('#cafe')).toHaveAttribute('data-art-pack', new RegExp(`^v6-${venue}-`), { timeout: 15_000 });
  await expect(page.locator('#cafe')).toHaveAttribute('data-art-assets', 'ready', { timeout: 15_000 });
  await expect(page.locator('#cafe')).toHaveAttribute('data-atmosphere-assets', 'ready', { timeout: 15_000 });
}

async function hideVisualUi(page: Page): Promise<void> {
  await page.getByTestId('welcome').evaluate((element) => { element.style.display = 'none'; });
  await page.getByTestId('controls').evaluate((element) => { (element as HTMLElement).hidden = true; });
}

async function captureBaseline(page: Page, name: string): Promise<void> {
  await expect(page.locator('#app')).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
}

const livingBaselines = [
  { venue: 'cafe', sequence: 'cafe-window-to-pastry', time: '20:30', weather: 'rain', captureFrames: 125 },
  { venue: 'ramen', sequence: 'ramen-counter-water', time: '20:30', weather: 'rain', captureFrames: 90 },
  { venue: 'arcade', sequence: 'arcade-token-lane', time: '22:00', weather: 'clear', captureFrames: 90 },
] as const;

for (const scene of livingBaselines) {
  test(`hält ${scene.venue} während der Golden Living Sequence kollisionsfrei`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 810 });
    await installFramePause(page);
    await openCafe(
      page,
      `/?livingSequence=${scene.sequence}&time=${scene.time}&weather=${scene.weather}`,
      'balanced',
    );
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    await stepDiagnosticFrames(page, scene.captureFrames);
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-living-direction', 'active');
    await expect(canvas).toHaveAttribute('data-living-route', new RegExp(`(^|,)${scene.sequence}(,|$)`));
    await expect(canvas).toHaveAttribute('data-navigation-status', 'clear');
    await expect(canvas).toHaveAttribute('data-navigation-deadlocks', '0');
    await expect.poll(async () => Number(await canvas.getAttribute('data-navigation-minimum-distance')))
      .toBeGreaterThanOrEqual(9.5);
    await renderVisualFrame(page);
    await hideVisualUi(page);
    await captureBaseline(page, `v7-living-${scene.venue}`);

    await stepDiagnosticFrames(page, 520);
    await expect.poll(async () => Number(await canvas.getAttribute('data-living-completed'))).toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-navigation-status', 'clear');
    await expect(canvas).toHaveAttribute('data-navigation-deadlocks', '0');
    await expect.poll(async () => Number(await canvas.getAttribute('data-navigation-max-blocked'))).toBeLessThan(2);
  });
}

for (const scene of livingBaselines) {
  test(`hält ${scene.venue} mobil mit Reduced Motion navigationssicher`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFramePause(page);
    await openCafe(
      page,
      `/?livingSequence=${scene.sequence}&time=${scene.time}&weather=${scene.weather}`,
      'balanced',
    );
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    await stepDiagnosticFrames(page, scene.captureFrames);
    const canvas = page.locator('#cafe');
    await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(canvas).toHaveAttribute('data-particles', 'low');
    await expect(canvas).toHaveAttribute('data-living-route', new RegExp(`(^|,)${scene.sequence}(,|$)`));
    await expect(canvas).toHaveAttribute('data-navigation-status', 'clear');
    await expect(canvas).toHaveAttribute('data-navigation-deadlocks', '0');
    await stepDiagnosticFrames(page, 520);
    await expect.poll(async () => Number(await canvas.getAttribute('data-living-completed'))).toBeGreaterThan(0);
    await expect.poll(async () => Number(await canvas.getAttribute('data-navigation-max-blocked'))).toBeLessThan(2);
  });
}

for (const scene of visualVenues) {
  test(`hält die V3-Übersicht ${scene.venue} als Baseline`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFramePause(page);
    await openCafe(page, `/?time=${scene.time}&weather=${scene.weather}`, 'balanced');
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    await stepDiagnosticFrames(page, 1);
    await expect(page.locator('#cafe')).toHaveAttribute('data-camera-phase', 'overview');
    await renderVisualFrame(page);
    await setFramePaused(page, true);
    await hideVisualUi(page);
    await captureBaseline(page, `v3-${scene.venue}-overview`);
  });
}

for (const scene of cinematicBaselines) {
  for (const beat of ['establishing', 'detail', 'reaction'] as const satisfies readonly VisualBeat[]) {
    test(`hält ${scene.venue}-${scene.story}-${beat} als V3-Baseline`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 1440, height: 810 });
      await installFramePause(page);
      await openCafe(
        page,
        `/?moment=${scene.moment}&time=${scene.time}&weather=${scene.weather}&cinematicShot=${beat}`,
        'balanced',
      );
      await chooseVenue(page, scene.venue);
      await pauseBeforeEntry(page);
      await page.getByTestId('enter').click();
      await stepDiagnosticFrames(page, 4);
      await stepDiagnosticFrames(page, 12, 0);
      const canvas = page.locator('#cafe');
      await hideVisualUi(page);
      await expect(canvas).toHaveAttribute('data-moment', scene.moment, { timeout: 20_000 });
      await expect(canvas).toHaveAttribute('data-camera-sequence', `moment:${scene.moment}`, { timeout: 20_000 });
      await expect(canvas).toHaveAttribute('data-shot-beat', beat, { timeout: 20_000 });
      await expect(canvas).toHaveAttribute('data-focus-safe', 'true', { timeout: 20_000 });
      await renderVisualFrame(page);
      await setFramePaused(page, true);
      await captureBaseline(page, `v3-${scene.venue}-${scene.story}-${beat}`);
    });
  }
}

for (const scene of visualVenues) {
  test(`hält die mobile V3-Komposition ${scene.venue}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFramePause(page);
    await openCafe(page, `/?time=${scene.time}&weather=${scene.weather}`, 'balanced');
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    await stepDiagnosticFrames(page, 1);
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-camera-phase', 'overview');
    await expect(canvas).toHaveAttribute('data-particles', 'low');
    await renderVisualFrame(page);
    await setFramePaused(page, true);
    await hideVisualUi(page);
    await captureBaseline(page, `v3-${scene.venue}-mobile`);
  });
}

test('hält Reduced Motion als vollständig statische V3-Baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFramePause(page);
  await openCafe(page, '/?time=20:30&weather=storm', 'balanced');
  await chooseVenue(page, 'cafe');
  await pauseBeforeEntry(page);
  await page.getByTestId('enter').click();
  await stepDiagnosticFrames(page, 1);
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-shot-beat', 'overview');
  await expect(canvas).toHaveAttribute('data-camera-sequence', 'none');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await expect(canvas).toHaveAttribute('data-clock-time', '20:30');
  await renderVisualFrame(page);
  await setFramePaused(page, true);
  await hideVisualUi(page);
  await captureBaseline(page, 'v3-reduced-motion');
});

test('hält Renderer- und Art-Pack-Fallback als V3-Baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFramePause(page);
  await openCafe(page, '/?time=20:30&weather=rain&art=fallback', 'fallback');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-art-assets', 'failed', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-art-pack', /^procedural/);
  await expect(canvas).toHaveAttribute('data-quality-tier', 'fallback');
  await pauseBeforeEntry(page);
  await page.getByTestId('enter').click();
  await stepDiagnosticFrames(page, 1);
  await renderVisualFrame(page);
  await setFramePaused(page, true);
  await hideVisualUi(page);
  await captureBaseline(page, 'v3-renderer-art-fallback');
});

const atmosphereBaselines = [
  { name: 'v5-cafe-espresso', venue: 'cafe', wave: 'cafe-espresso-cycle', time: '20:30', weather: 'rain' },
  { name: 'v5-ramen-broth', venue: 'ramen', wave: 'ramen-broth-breath', time: '20:30', weather: 'rain' },
  { name: 'v5-arcade-chorus', venue: 'arcade', wave: 'arcade-machine-chorus', time: '22:00', weather: 'clear' },
  { name: 'v5-rain-surge', venue: 'cafe', wave: 'rain-surge', time: '20:30', weather: 'rain' },
  { name: 'v5-distant-thunder', venue: 'cafe', wave: 'distant-thunder', time: '20:30', weather: 'storm' },
  { name: 'v5-snow-quiet', venue: 'cafe', wave: 'snow-quiet', time: '23:30', weather: 'snow' },
  { name: 'v5-fog-glow', venue: 'cafe', wave: 'fog-glow', time: '06:30', weather: 'fog' },
] as const;

for (const scene of atmosphereBaselines) {
  test(`hält ${scene.name} als V5-Baseline`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 1440, height: 810 });
    await installFramePause(page);
    await openCafe(page, `/?time=${scene.time}&weather=${scene.weather}&atmosphere=${scene.wave}&atmospherePhase=hold`, 'balanced');
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-atmosphere-wave', scene.wave, { timeout: 10_000 });
    await expect(canvas).toHaveAttribute('data-atmosphere-phase', 'hold');
    await expect.poll(async () => Number(await canvas.getAttribute('data-atmosphere-intensity'))).toBeGreaterThan(0.99);
    await renderVisualFrame(page);
    await setFramePaused(page, true);
    await hideVisualUi(page);
    await captureBaseline(page, scene.name);
  });
}

const mobileAtmosphereBaselines = [
  { name: 'v5-cafe-mobile-pedestrian', venue: 'cafe', wave: 'pedestrian-poetry', time: '20:30', weather: 'rain' },
  { name: 'v5-ramen-mobile-wind', venue: 'ramen', wave: 'wind-gust', time: '20:30', weather: 'rain' },
  { name: 'v5-arcade-mobile-traffic', venue: 'arcade', wave: 'traffic-glow', time: '22:00', weather: 'clear' },
] as const;

for (const scene of mobileAtmosphereBaselines) {
  test(`hält ${scene.name} als mobile V5-Baseline`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await installFramePause(page);
    await openCafe(page, `/?time=${scene.time}&weather=${scene.weather}&atmosphere=${scene.wave}&atmospherePhase=hold`, 'balanced');
    await chooseVenue(page, scene.venue);
    await pauseBeforeEntry(page);
    await page.getByTestId('enter').click();
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-atmosphere-wave', scene.wave, { timeout: 10_000 });
    await renderVisualFrame(page);
    await setFramePaused(page, true);
    await hideVisualUi(page);
    await captureBaseline(page, scene.name);
  });
}

test('hält bewegte Außenwellen bei Reduced Motion als ruhige V5-Überblendung', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFramePause(page);
  await openCafe(page, '/?time=20:30&weather=rain&atmosphere=pedestrian-poetry&atmospherePhase=hold', 'balanced');
  await chooseVenue(page, 'cafe');
  await pauseBeforeEntry(page);
  await page.getByTestId('enter').click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-atmosphere-wave', 'pedestrian-poetry', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(canvas).toHaveAttribute('data-particles', 'low');
  await renderVisualFrame(page);
  await setFramePaused(page, true);
  await hideVisualUi(page);
  await captureBaseline(page, 'v5-reduced-motion');
});

test('hält den V5-Atmosphärenfallback ohne Atlas- oder Bloom-Abhängigkeit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  await installFramePause(page);
  await openCafe(page, '/?time=20:30&weather=rain&atmosphere=rain-surge&atmospherePhase=hold&atmosphereAssets=fallback', 'fallback');
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-atmosphere-assets', 'failed', { timeout: 15_000 });
  await pauseBeforeEntry(page);
  await page.getByTestId('enter').click();
  await expect(canvas).toHaveAttribute('data-atmosphere-wave', 'rain-surge', { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-bloom-pass', 'off');
  await renderVisualFrame(page);
  await setFramePaused(page, true);
  await hideVisualUi(page);
  await captureBaseline(page, 'v5-atmosphere-fallback');
});

test('hält Draw-Call- und Texturbudgets am Höhepunkt aller Venue-Signaturen', async ({ page }) => {
  test.setTimeout(75_000);
  const cases = [
    { venue: 'cafe', wave: 'cafe-espresso-cycle', drawCalls: 220 },
    { venue: 'ramen', wave: 'ramen-broth-breath', drawCalls: 130 },
    { venue: 'arcade', wave: 'arcade-machine-chorus', drawCalls: 165 },
  ] as const;
  await page.setViewportSize({ width: 1440, height: 810 });
  for (const entry of cases) {
    await openCafe(page, `/?time=20:30&weather=rain&atmosphere=${entry.wave}&atmospherePhase=hold`, 'master');
    await chooseVenue(page, entry.venue);
    const canvas = page.locator('#cafe');
    await expect(canvas).toHaveAttribute('data-atmosphere-wave', entry.wave, { timeout: 10_000 });
    await renderVisualFrame(page);
    const metrics = await canvas.evaluate((element) => ({
      drawCalls: Number(element.dataset.drawCalls),
      textureBytes: Number(element.dataset.estimatedTextureBytes),
      characterCache: Number(element.dataset.characterCache),
      renderTargets: Number(element.dataset.renderTargets),
    }));
    expect(metrics.drawCalls).toBeLessThanOrEqual(entry.drawCalls);
    expect(metrics.textureBytes).toBeLessThan(64 * 1024 * 1024);
    expect(metrics.characterCache).toBeLessThanOrEqual(64);
    expect(metrics.renderTargets).toBe(4);
  }
});
