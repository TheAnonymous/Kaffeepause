import { expect, type Page } from '@playwright/test';

export type Venue = 'cafe' | 'ramen' | 'arcade';
export type QualityTier = 'master' | 'balanced' | 'fallback';

type TestWindow = typeof window & {
  setDioramaPaused?: (paused: boolean) => void;
  stepDioramaDiagnosticFrame?: (deltaSeconds?: number) => void;
  renderDioramaVisualFrame?: () => void;
};

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Öffnet die Seite im Testmodus: Frames werden nur auf Anfrage gezeichnet. */
export async function openCafe(page: Page, path = '/', tier: QualityTier = 'fallback'): Promise<void> {
  const url = new URL(path, 'http://kaffeepause.test');
  url.searchParams.set('quality', tier);
  url.searchParams.set('testRender', 'diagnostic');
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await expect(page.locator('#cafe')).toHaveAttribute('data-renderer-state', 'ready', { timeout: 15_000 });
}

/** Ersetzt document.hidden, damit ein Test die Renderschleife anhalten kann. */
export async function installFramePause(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as TestWindow).setDioramaPaused = (paused) => {
      hidden = paused;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

export async function setFramePaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((nextPaused) => (window as TestWindow).setDioramaPaused?.(nextPaused), paused);
  await expect(page.locator('#cafe')).toHaveAttribute('data-render-loop', paused ? 'paused' : 'running');
}

export async function chooseVenue(page: Page, venue: Venue): Promise<void> {
  if (venue !== 'cafe') await page.locator(`[data-venue-choice="${venue}"]`).click();
  const canvas = page.locator('#cafe');
  await expect(canvas).toHaveAttribute('data-art-pack', new RegExp(`^v6-${venue}-`), { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-art-assets', 'ready', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-atmosphere-assets', 'ready', { timeout: 15_000 });
}

/** Simuliert Szenenzeit ohne zu zeichnen. */
export async function stepSimulation(page: Page, frames: number, deltaSeconds = 0.1): Promise<void> {
  await page.evaluate(({ count, delta }) => {
    for (let frame = 0; frame < count; frame += 1) (window as TestWindow).stepDioramaDiagnosticFrame?.(delta);
  }, { count: frames, delta: deltaSeconds });
}

export async function renderVisualFrame(page: Page): Promise<void> {
  const canvas = page.locator('#cafe');
  const previous = Number(await canvas.getAttribute('data-visual-render-count'));
  await page.evaluate(() => (window as TestWindow).renderDioramaVisualFrame?.());
  await expect.poll(async () => Number(await canvas.getAttribute('data-visual-render-count'))).toBeGreaterThan(previous);
}

export async function hideVisualUi(page: Page): Promise<void> {
  await page.getByTestId('welcome').evaluate((element) => { element.style.display = 'none'; });
  await page.getByTestId('controls').evaluate((element) => { (element as HTMLElement).hidden = true; });
  await page.getByTestId('caption').evaluate((element) => { element.style.display = 'none'; });
}
