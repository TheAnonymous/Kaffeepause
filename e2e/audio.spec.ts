import { expect, test, type Page } from '@playwright/test';
import { chooseVenue, openCafe, type Venue } from './helpers';

// Misst im Testmodus, was zu hören ist: Regen nur bei Regen, Wind je nach Wetter, die Orte etwa gleich laut.
// Pegel in dBFS als Mittel über die Leistung vieler kurzer Messfenster (Noten und Pausen gleichen sich aus).

type Levels = Record<string, number>;

async function listen(page: Page, venue: Venue, query: string): Promise<Levels> {
  await openCafe(page, `/?${query}`, 'fallback');
  await chooseVenue(page, venue);
  await page.getByTestId('enter').click();
  await expect(page.getByTestId('sound')).toHaveAttribute('data-audio-state', /playing/, { timeout: 10_000 });
  // Die Spuren blenden mit einer Zeitkonstante von 1,6 s ein.
  await page.waitForTimeout(6_000);
  const power: Record<string, number> = {};
  const samples = 40;
  for (let index = 0; index < samples; index += 1) {
    const levels = await page.evaluate(() => (window as typeof window & { readAudioLevels: () => Levels }).readAudioLevels());
    for (const [key, db] of Object.entries(levels)) power[key] = (power[key] ?? 0) + (db <= -120 ? 0 : 10 ** (db / 10)) / samples;
    await page.waitForTimeout(80);
  }
  return Object.fromEntries(Object.entries(power).map(([key, value]) => [key, value > 0 ? 10 * Math.log10(value) : -120]));
}

test('lässt es nur bei Regen regnen und den Schnee dämpfen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 960, height: 540 });
  const clear = await listen(page, 'cafe', 'time=13:00&weather=clear');
  const rain = await listen(page, 'cafe', 'time=13:00&weather=rain');
  const snow = await listen(page, 'cafe', 'time=13:00&weather=snow');
  const cloudy = await listen(page, 'cafe', 'time=13:00&weather=cloudy');
  expect(clear.rain, 'Regen bei Sonne').toBeLessThan(-90);
  expect(snow.rain, 'Regen bei Schnee').toBeLessThan(-90);
  expect(rain.rain, 'Regen bei Regen').toBeGreaterThan(-55);
  expect(snow.wind!, 'Schnee dämpft den Wind').toBeLessThan(cloudy.wind! - 3);
  expect(Math.abs(rain.master! - clear.master!), 'Regen ist zu hören, übertönt aber nicht alles').toBeLessThan(6);
});

test('hält die drei Orte etwa gleich laut', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 960, height: 540 });
  const masters: number[] = [];
  for (const venue of ['cafe', 'ramen', 'arcade'] as const) masters.push((await listen(page, venue, 'time=13:00&weather=clear')).master!);
  expect(Math.max(...masters) - Math.min(...masters)).toBeLessThan(4);
});
