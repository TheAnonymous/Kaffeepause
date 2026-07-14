import { describe, expect, it } from 'vitest';
import { RENDER_QUALITY, RENDER_QUALITY_REPORT, validateRenderQuality } from '../src/scene/renderQuality';

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
});
