import { describe, expect, it } from 'vitest';
import {
  FrameBudgetProbe,
  initialRenderQualityTier,
  lowerQualityTier,
  parseRenderQualityOverride,
  RENDER_QUALITY,
  RENDER_QUALITY_PROFILES,
  RENDER_QUALITY_REPORT,
  RenderQualityGovernor,
  validateRenderQuality,
} from '../src/scene/renderQuality';

function observeWindow(
  governor: RenderQualityGovernor,
  values: Readonly<{ frameMs: number; cpuMs: number; gpuMs?: number }>,
  startMs: number,
  mobile = false,
) {
  let decision;
  for (let index = 0; index < 3; index += 1) {
    decision = governor.observe({ ...values, timestampMs: startMs + index * 10 }, {
      mobile, visible: true, reducedMotion: false,
    }) ?? decision;
  }
  return decision;
}

describe('HD-2D-Masterauflösung', () => {
  it('rendert die vollständige Szene auf einer echten 6×-Masterfläche', () => {
    expect(RENDER_QUALITY.masterScale).toBe(6);
    expect(RENDER_QUALITY.masterWidth).toBe(2_304);
    expect(RENDER_QUALITY.masterHeight).toBe(1_296);
    expect(RENDER_QUALITY_REPORT).toEqual(validateRenderQuality());
    expect(RENDER_QUALITY_REPORT.valid).toBe(true);
    expect(RENDER_QUALITY_REPORT.score).toBe(100);
  });

  it('reserviert für Figuren und Gesichter genug echte Rasterzellen', () => {
    expect(RENDER_QUALITY.characterRasterHeight).toBeGreaterThanOrEqual(180);
    expect(RENDER_QUALITY.faceRasterHeight).toBeGreaterThanOrEqual(54);
    expect(RENDER_QUALITY_REPORT.physicalPixels).toBeGreaterThan(2_900_000);
  });

  it('definiert die drei internen Stufen mit realen Render- und Effektgrenzen', () => {
    expect(RENDER_QUALITY_PROFILES.master).toMatchObject({ renderScale: 6, shadowMapSize: 2048, bloom: 'full', characterFrameRate: 6 });
    expect(RENDER_QUALITY_PROFILES.balanced).toMatchObject({ renderScale: 4, shadowMapSize: 1024, bloom: 'reduced', characterFrameRate: 4 });
    expect(RENDER_QUALITY_PROFILES.fallback).toMatchObject({
      renderScale: 3, shadowMapSize: 512, bloom: 'off', miniatureBlur: 'simplified', characterFrameRate: 3,
    });
    expect(lowerQualityTier('master')).toBe('balanced');
    expect(lowerQualityTier('balanced')).toBe('fallback');
    expect(lowerQualityTier('fallback')).toBeUndefined();
  });

  it('akzeptiert den Quality-Parameter ausschließlich im Entwicklungsmodus', () => {
    expect(parseRenderQualityOverride('?quality=fallback', true)).toBe('fallback');
    expect(parseRenderQualityOverride('?quality=balanced', true)).toBe('balanced');
    expect(parseRenderQualityOverride('?quality=ultra', true)).toBeUndefined();
    expect(parseRenderQualityOverride('?quality=fallback', false)).toBeUndefined();
  });

  it('startet Desktop ab 700 CSS-Pixeln in Master und Mobile in Balanced', () => {
    expect(initialRenderQualityTier(1_280)).toBe('master');
    expect(initialRenderQualityTier(700)).toBe('master');
    expect(initialRenderQualityTier(699)).toBe('balanced');
  });

  it('misst erst nach der Aufwärmphase und stuft nach zwei schlechten 180er-Fenstern ab', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 40, sampleFrames: 3, cooldownMs: 0,
    });
    for (const timestampMs of [0, 20, 39]) {
      expect(governor.observe({ frameMs: 40, cpuMs: 8, timestampMs }, {
        mobile: false, visible: true, reducedMotion: false,
      })).toBeUndefined();
    }
    expect(observeWindow(governor, { frameMs: 30, cpuMs: 8 }, 40)).toBeUndefined();
    expect(observeWindow(governor, { frameMs: 30, cpuMs: 8 }, 100)).toMatchObject({
      previousTier: 'master', tier: 'balanced', action: 'downgrade', reason: 'frame-p95',
    });
    expect(governor.currentTier).toBe('balanced');
  });

  it('respektiert fünf Sekunden Cooldown und reduziert danach bis Fallback', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 5_000,
    });
    observeWindow(governor, { frameMs: 31, cpuMs: 8 }, 0);
    expect(observeWindow(governor, { frameMs: 31, cpuMs: 8 }, 100)?.tier).toBe('balanced');
    observeWindow(governor, { frameMs: 31, cpuMs: 8 }, 200);
    expect(observeWindow(governor, { frameMs: 31, cpuMs: 8 }, 300)).toBeUndefined();
    expect(observeWindow(governor, { frameMs: 31, cpuMs: 8 }, 5_200)?.tier).toBe('fallback');
    expect(governor.currentTier).toBe('fallback');
  });

  it('wertet CPU und gültige GPU-P95 aus, fällt ohne Extension aber auf Frame und CPU zurück', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 0,
    });
    observeWindow(governor, { frameMs: 16, cpuMs: 13 }, 0);
    expect(observeWindow(governor, { frameMs: 16, cpuMs: 13 }, 100)).toMatchObject({ reason: 'cpu-p95' });

    const gpu = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 0,
    });
    observeWindow(gpu, { frameMs: 16, cpuMs: 8, gpuMs: 19 }, 0);
    expect(observeWindow(gpu, { frameMs: 16, cpuMs: 8, gpuMs: 19 }, 100)).toMatchObject({ reason: 'gpu-p95' });

    const fallback = new RenderQualityGovernor('master', { warmupMs: 0, sampleFrames: 3 });
    observeWindow(fallback, { frameMs: 16, cpuMs: 8 }, 0);
    observeWindow(fallback, { frameMs: 16, cpuMs: 8 }, 100);
    expect(fallback.currentTier).toBe('master');
    expect(fallback.lastWindow).toMatchObject({ healthy: true });
    expect(fallback.lastWindow?.gpuP95).toBeUndefined();
  });

  it('ignoriert versteckte, Reduced-Motion- und ungültige Messsamples vollständig', () => {
    const governor = new RenderQualityGovernor('master', { warmupMs: 0, sampleFrames: 3, cooldownMs: 0 });
    for (let index = 0; index < 20; index += 1) {
      governor.observe({ frameMs: 100, cpuMs: 100, gpuMs: Number.NaN, timestampMs: index }, {
        mobile: false, visible: index % 2 === 0, reducedMotion: index % 2 === 0,
      });
    }
    expect(governor.lastWindow).toBeUndefined();
    expect(governor.currentTier).toBe('master');
  });

  it('stuft Mobile nach zehn stabilen Sekunden und drei gesunden Fenstern genau einmal hoch', () => {
    const governor = new RenderQualityGovernor('balanced', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 0, stablePromotionMs: 10_000,
    });
    expect(observeWindow(governor, { frameMs: 20, cpuMs: 8 }, 0, true)).toBeUndefined();
    expect(observeWindow(governor, { frameMs: 20, cpuMs: 8 }, 5_000, true)).toBeUndefined();
    expect(observeWindow(governor, { frameMs: 20, cpuMs: 8 }, 10_000, true)).toMatchObject({
      previousTier: 'balanced', tier: 'master', action: 'upgrade', reason: 'mobile-stable',
    });
    observeWindow(governor, { frameMs: 40, cpuMs: 8 }, 11_000, true);
    expect(observeWindow(governor, { frameMs: 40, cpuMs: 8 }, 12_000, true)?.tier).toBe('balanced');
    for (const start of [20_000, 25_000, 30_000, 35_000]) observeWindow(governor, { frameMs: 20, cpuMs: 8 }, start, true);
    expect(governor.currentTier).toBe('balanced');
  });

  it('beginnt die mobile Stabilitätszeit nach einem Gerätekontextwechsel neu', () => {
    const governor = new RenderQualityGovernor('balanced', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 0, stablePromotionMs: 10_000,
    });
    observeWindow(governor, { frameMs: 16, cpuMs: 8 }, 0, false);
    observeWindow(governor, { frameMs: 16, cpuMs: 8 }, 5_000, false);
    expect(observeWindow(governor, { frameMs: 16, cpuMs: 8 }, 10_000, true)).toBeUndefined();
    expect(governor.currentTier).toBe('balanced');
    observeWindow(governor, { frameMs: 16, cpuMs: 8 }, 15_000, true);
    expect(observeWindow(governor, { frameMs: 16, cpuMs: 8 }, 20_000, true)).toMatchObject({
      action: 'upgrade', tier: 'master', reason: 'mobile-stable',
    });
  });

  it('erlaubt nach einer Herabstufung keinerlei spätere Hochstufung', () => {
    const governor = new RenderQualityGovernor('balanced', {
      warmupMs: 0, sampleFrames: 3, cooldownMs: 0, stablePromotionMs: 0,
    });
    observeWindow(governor, { frameMs: 40, cpuMs: 8 }, 0, true);
    expect(observeWindow(governor, { frameMs: 40, cpuMs: 8 }, 100, true)?.tier).toBe('fallback');
    for (const start of [200, 300, 400, 500]) observeWindow(governor, { frameMs: 20, cpuMs: 8 }, start, true);
    expect(governor.currentTier).toBe('fallback');
  });

  it('prüft nach der Aufwärmung Desktop-Median/P95 und das reduzierte Mobile-Profil getrennt', () => {
    const desktop = new FrameBudgetProbe(0, 1_000);
    let desktopReport;
    for (let index = 0; index < 63; index += 1) desktopReport = desktop.observe(index === 62 ? 24 : 16, false) ?? desktopReport;
    expect(desktopReport).toMatchObject({ valid: true, profile: 'desktop', median: 16, p95: 16 });

    const mobile = new FrameBudgetProbe(0, 1_000);
    let mobileReport;
    for (let index = 0; index < 40; index += 1) mobileReport = mobile.observe(index === 39 ? 32 : 26, true) ?? mobileReport;
    expect(mobileReport).toMatchObject({ valid: true, profile: 'mobile', p95: 26 });
  });

  it('meldet auch extrem langsame Software-Frames ehrlich als Budgetverletzung', () => {
    const probe = new FrameBudgetProbe(0, 1_000);
    expect(probe.observe(1_250, false)).toMatchObject({
      valid: false, profile: 'desktop', median: 1_250, p95: 1_250, samples: 1,
    });
  });
});
