import { describe, expect, it } from 'vitest';
import {
  FrameBudgetProbe,
  lowerQualityTier,
  parseRenderQualityOverride,
  RENDER_QUALITY,
  RENDER_QUALITY_PROFILES,
  RENDER_QUALITY_REPORT,
  RenderQualityGovernor,
  validateRenderQuality,
} from '../src/scene/renderQuality';

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

  it('misst erst nach der Aufwärmphase und stuft bei einem Median über 28 ms einzeln ab', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 40, sampleFrames: 3, slowFrameThresholdMs: 28, cooldownMs: 50,
    });
    expect(governor.observeVisibleFrame(20)).toBeUndefined();
    expect(governor.observeVisibleFrame(20)).toBeUndefined();
    expect(governor.observeVisibleFrame(30)).toBeUndefined();
    expect(governor.observeVisibleFrame(35)).toBeUndefined();
    expect(governor.observeVisibleFrame(31)).toBe('balanced');
    expect(governor.currentTier).toBe('balanced');
  });

  it('respektiert den Cooldown und reduziert nach einer zweiten langsamen Stichprobe bis fallback', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 2, slowFrameThresholdMs: 28, cooldownMs: 50,
    });
    expect(governor.observeVisibleFrame(31)).toBeUndefined();
    expect(governor.observeVisibleFrame(32)).toBe('balanced');
    expect(governor.observeVisibleFrame(25)).toBeUndefined();
    expect(governor.observeVisibleFrame(25)).toBeUndefined();
    expect(governor.observeVisibleFrame(31)).toBeUndefined();
    expect(governor.observeVisibleFrame(32)).toBe('fallback');
    expect(governor.currentTier).toBe('fallback');
  });

  it('senkt bei einem P95-Ausreißer trotz gutem Median ab und behält eine stabile Stufe', () => {
    const governor = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 3, slowFrameThresholdMs: 28, slowFrameP95ThresholdMs: 25,
    });
    governor.observeVisibleFrame(16);
    governor.observeVisibleFrame(16);
    expect(governor.observeVisibleFrame(33)).toBe('balanced');
    expect(governor.currentTier).toBe('balanced');

    const stable = new RenderQualityGovernor('master', {
      warmupMs: 0, sampleFrames: 3, slowFrameThresholdMs: 28, slowFrameP95ThresholdMs: 25,
    });
    stable.observeVisibleFrame(16);
    stable.observeVisibleFrame(18);
    expect(stable.observeVisibleFrame(24)).toBeUndefined();
    expect(stable.currentTier).toBe('master');
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
