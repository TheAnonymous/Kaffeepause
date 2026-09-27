import { expect, test, type Page } from '@playwright/test';
import {
  chooseVenue,
  hideVisualUi,
  installFramePause,
  openCafe,
  renderVisualFrame,
  setFramePaused,
  stepSimulation,
  type Venue,
} from './helpers';

// Fotografiert jeden Ort zu mehreren Tageszeiten und prüft, dass die Szene hell
// und kontrastreich genug bleibt. Die Bilder landen in look/ zum Anschauen.

interface LookStats {
  readonly mean: number;
  readonly darkShare: number;
  readonly p10: number;
  readonly p90: number;
}

const SCENES = [
  { name: 'tag', time: '13:00', weather: 'clear' },
  { name: 'abend', time: '20:30', weather: 'rain' },
  { name: 'nacht', time: '23:30', weather: 'clear' },
] as const;

const VENUES: readonly Venue[] = ['cafe', 'ramen', 'arcade'];

// Mittlere Helligkeit (0–255, gammakodiert) und Anteil fast schwarzer Pixel.
const MINIMUM_MEAN = 55;
const MAXIMUM_DARK_SHARE = 0.08;
const MINIMUM_SPREAD = 30;

async function measure(page: Page, png: Buffer): Promise<LookStats> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D-Kontext fehlt');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Array<number>(256).fill(0);
    let sum = 0;
    let dark = 0;
    const pixels = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      const luma = Math.round(0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!);
      histogram[luma]! += 1;
      sum += luma;
      if (luma < 24) dark += 1;
    }
    const percentile = (fraction: number): number => {
      let seen = 0;
      for (let value = 0; value < 256; value += 1) {
        seen += histogram[value]!;
        if (seen >= pixels * fraction) return value;
      }
      return 255;
    };
    return { mean: sum / pixels, darkShare: dark / pixels, p10: percentile(0.1), p90: percentile(0.9) };
  }, png.toString('base64'));
}

async function captureScene(page: Page, venue: Venue, query: string, file: string): Promise<LookStats> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFramePause(page);
  await openCafe(page, `/?${query}`, 'balanced');
  await chooseVenue(page, venue);
  await page.evaluate(() => (window as typeof window & { setDioramaPaused?: (paused: boolean) => void }).setDioramaPaused?.(true));
  await page.getByTestId('enter').click();
  // Anderthalb Minuten Szenenzeit, damit Gäste angekommen und beschäftigt sind.
  await stepSimulation(page, 900);
  await renderVisualFrame(page);
  await setFramePaused(page, true);
  await hideVisualUi(page);
  const png = await page.locator('#app').screenshot({ path: `look/${file}.png`, animations: 'disabled' });
  return measure(page, png);
}

for (const venue of VENUES) {
  for (const scene of SCENES) {
    test(`${venue} ist ${scene.name}s hell genug`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 1440, height: 810 });
      const stats = await captureScene(page, venue, `time=${scene.time}&weather=${scene.weather}`, `${venue}-${scene.name}`);
      test.info().annotations.push({ type: 'look', description: JSON.stringify(stats) });
      console.log(`${venue}-${scene.name}: ${JSON.stringify(stats)}`);
      expect(stats.mean, 'mittlere Helligkeit').toBeGreaterThanOrEqual(MINIMUM_MEAN);
      expect(stats.darkShare, 'Anteil fast schwarzer Pixel').toBeLessThanOrEqual(MAXIMUM_DARK_SHARE);
      expect(stats.p90 - stats.p10, 'Kontrastumfang').toBeGreaterThanOrEqual(MINIMUM_SPREAD);
    });
  }

  test(`${venue} ist auf dem Handy hell genug`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const stats = await captureScene(page, venue, 'time=20:30&weather=rain', `${venue}-handy`);
    console.log(`${venue}-handy: ${JSON.stringify(stats)}`);
    expect(stats.mean, 'mittlere Helligkeit').toBeGreaterThanOrEqual(MINIMUM_MEAN);
    expect(stats.darkShare, 'Anteil fast schwarzer Pixel').toBeLessThanOrEqual(MAXIMUM_DARK_SHARE);
  });
}
