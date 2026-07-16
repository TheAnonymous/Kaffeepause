import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4191;
const origin = `http://127.0.0.1:${port}`;
const drawCallBudgets = { cafe: 220, ramen: 130, arcade: 165 };
const fail = (message) => { throw new Error(message); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) fail(`preview exited early (${server.exitCode})\n${serverOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch { /* Preview is still starting. */ }
    await wait(100);
  }
  fail(`preview did not become ready\n${serverOutput}`);
}

async function readyPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#cafe').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-renderer-state') === 'ready');
  return { page, errors };
}

async function collectMetrics(page) {
  return page.locator('#cafe').evaluate((element) => ({
    venue: element.dataset.venue,
    qualityTier: element.dataset.qualityTier,
    qualityReason: element.dataset.qualityReason,
    bloomResolution: element.dataset.bloomResolution,
    drawCalls: Number(element.dataset.drawCalls),
    triangles: Number(element.dataset.triangles),
    geometries: Number(element.dataset.geometries),
    v3GeometryBaseline: Number(element.dataset.v3GeometryBaseline),
    gpuTextures: Number(element.dataset.gpuTextures),
    estimatedTextureBytes: Number(element.dataset.estimatedTextureBytes),
    characterCache: Number(element.dataset.characterCache),
    staticBatches: Number(element.dataset.staticBatches),
    staticInstances: Number(element.dataset.staticInstances),
    renderTargets: Number(element.dataset.renderTargets),
  }));
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const results = {};
  for (const venue of ['cafe', 'ramen', 'arcade']) {
    const { page, errors } = await readyPage(browser, { width: 1440, height: 810 });
    if (venue !== 'cafe') await page.locator(`[data-venue-choice="${venue}"]`).click();
    const canvas = page.locator('#cafe');
    await page.waitForFunction((expected) => document.querySelector('#cafe')?.getAttribute('data-venue') === expected, venue);
    await page.waitForFunction((expected) => document.querySelector('#cafe')?.getAttribute('data-art-pack')?.startsWith(`v3-${expected}-`), venue);
    const renderCount = Number(await canvas.getAttribute('data-render-count'));
    await page.locator(`[data-venue-choice="${venue}"]`).click();
    await page.waitForFunction((previous) => Number(document.querySelector('#cafe')?.getAttribute('data-render-count')) > previous, renderCount);
    const metrics = await collectMetrics(page);
    if (metrics.qualityTier !== 'master' || metrics.qualityReason !== 'initial-desktop-master') {
      fail(`${venue}: desktop did not start in adaptive Master (${JSON.stringify(metrics)})`);
    }
    if (!String(metrics.bloomResolution).startsWith('half:')) fail(`${venue}: Master bloom is not half resolution`);
    if (metrics.drawCalls > drawCallBudgets[venue]) fail(`${venue}: ${metrics.drawCalls} draw calls exceeds ${drawCallBudgets[venue]}`);
    if (metrics.geometries > Math.floor(metrics.v3GeometryBaseline * 0.6)) {
      fail(`${venue}: ${metrics.geometries} geometries exceeds 60% of V3 ${metrics.v3GeometryBaseline}`);
    }
    if (metrics.characterCache > 64) fail(`${venue}: character texture cache exceeds 64`);
    if (metrics.estimatedTextureBytes >= 64 * 1024 * 1024) fail(`${venue}: estimated textures exceed 64 MiB`);
    if (metrics.staticBatches <= 0 || metrics.staticInstances <= metrics.staticBatches) fail(`${venue}: static batching inactive`);
    if (metrics.renderTargets !== 4) fail(`${venue}: fixed render target count changed`);
    if (errors.length > 0) fail(`${venue}: browser errors: ${errors.join(' | ')}`);
    results[venue] = metrics;
    await page.close();
  }

  const mobileRun = await readyPage(browser, { width: 390, height: 844 });
  const mobileCanvas = mobileRun.page.locator('#cafe');
  await mobileRun.page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-art-assets') === 'ready');
  const mobileRenderCount = Number(await mobileCanvas.getAttribute('data-render-count'));
  await mobileRun.page.locator('[data-venue-choice="cafe"]').click();
  await mobileRun.page.waitForFunction((previous) => Number(document.querySelector('#cafe')?.getAttribute('data-render-count')) > previous, mobileRenderCount);
  const mobile = await collectMetrics(mobileRun.page);
  if (mobile.qualityTier !== 'balanced' || mobile.qualityReason !== 'initial-mobile-balanced') {
    fail(`mobile did not start in adaptive Balanced (${JSON.stringify(mobile)})`);
  }
  if (!String(mobile.bloomResolution).startsWith('quarter:')) fail('mobile Balanced bloom is not quarter resolution');
  if (mobile.estimatedTextureBytes >= 32 * 1024 * 1024) fail('mobile estimated textures exceed 32 MiB');
  if (mobileRun.errors.length > 0) fail(`mobile browser errors: ${mobileRun.errors.join(' | ')}`);
  await mobileRun.page.close();

  const contextRun = await readyPage(browser, { width: 1440, height: 810 });
  const contextCanvas = contextRun.page.locator('#cafe');
  await contextRun.page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-art-assets') === 'ready');
  await contextRun.page.locator('[data-venue-choice="cafe"]').click();
  await contextRun.page.waitForFunction(() => Number(document.querySelector('#cafe')?.getAttribute('data-character-cache')) > 0);
  await contextCanvas.evaluate((element) => element.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await contextRun.page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-art-pack') === 'procedural-context-fallback');
  if (await contextCanvas.getAttribute('data-character-cache') !== '0') fail('context loss did not clear character textures');
  await contextCanvas.evaluate((element) => element.dispatchEvent(new Event('webglcontextrestored')));
  await contextRun.page.waitForFunction(() => document.querySelector('#cafe')?.getAttribute('data-art-assets') === 'ready');
  if (contextRun.errors.length > 0) fail(`context recovery browser errors: ${contextRun.errors.join(' | ')}`);
  await contextRun.page.close();

  console.log(JSON.stringify({ venues: results, mobile, contextRecovery: 'pass' }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
