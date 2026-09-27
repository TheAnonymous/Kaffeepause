// Rauchtest für den fertigen Build: Sind Sounds und Grafiken dabei, und laden
// alle drei Orte im Produktionsbundle ohne Fehler und mit sichtbarem Bild?
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const port = 4191;
const origin = `http://127.0.0.1:${port}`;
const fail = (message) => { throw new Error(message); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

for (const venue of ['cafe', 'ramen', 'arcade']) {
  const directory = join('dist/audio', venue);
  const sounds = existsSync(directory) ? readdirSync(directory).filter((file) => file.endsWith('.mp3')) : [];
  if (sounds.length !== 5) fail(`dist/audio/${venue}: erwartet 5 MP3-Dateien, gefunden ${sounds.length}`);
  for (const atlas of [`dist/art/v6/venues/${venue}-atlas.webp`, `dist/art/v5/venues/${venue}-atlas.webp`]) {
    if (!existsSync(atlas)) fail(`${atlas} fehlt`);
  }
}

const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) fail(`vite preview beendet (${server.exitCode})\n${serverOutput}`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch { /* startet noch */ }
    await wait(100);
  }
  fail(`vite preview antwortet nicht\n${serverOutput}`);
}

async function meanLuma(page) {
  const png = await page.screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

async function visit(browser, venue, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  const canvas = page.locator('#cafe');
  await page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-renderer-state') === 'ready');
  await page.locator(`[data-venue-choice="${venue}"]`).click();
  await page.waitForFunction((expected) => (
    document.querySelector('#cafe')?.getAttribute('data-art-pack')?.startsWith(`v6-${expected}-`)
  ), venue, { timeout: 15_000 });
  await page.getByTestId('enter').click();
  const before = Number(await canvas.getAttribute('data-render-count'));
  // Headless-Chromium rendert per Software und damit langsam; ein paar Frames reichen.
  await page.waitForFunction((count) => (
    Number(document.querySelector('#cafe')?.getAttribute('data-render-count')) > count + 3
  ), before, { timeout: 30_000 });
  const luma = await meanLuma(page);
  const label = `${venue} ${viewport.width}×${viewport.height}`;
  if (errors.length > 0) fail(`${label}: Browserfehler: ${errors.join(' | ')}`);
  if (luma < 40) fail(`${label}: Bild zu dunkel (mittlere Helligkeit ${luma.toFixed(1)})`);
  await page.close();
  return `${label}: ok, Helligkeit ${luma.toFixed(0)}`;
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const venue of ['cafe', 'ramen', 'arcade']) console.log(await visit(browser, venue, { width: 1440, height: 810 }));
  console.log(await visit(browser, 'cafe', { width: 390, height: 844 }));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await Promise.race([exited, wait(5_000)]);
  }
}
