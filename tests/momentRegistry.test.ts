import { describe, expect, it } from 'vitest';
import { MOMENT_REGISTRY, momentDurationSeconds, venueMomentPool } from '../src/simulation/momentRegistry';

describe('V2-MomentRegistry', () => {
  it('enthält genau 18 eindeutige Definitionen und pro Ort 3+3', () => {
    expect(MOMENT_REGISTRY).toHaveLength(18);
    expect(new Set(MOMENT_REGISTRY.map((entry) => entry.kind)).size).toBe(18);
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const pool = venueMomentPool(venue);
      expect(pool).toHaveLength(6);
      expect(pool.filter((entry) => entry.category === 'ritual')).toHaveLength(3);
      expect(pool.filter((entry) => entry.category === 'encounter')).toHaveLength(3);
    }
  });

  it('definiert Teilnehmer, Anker, Cooldown, Audio, Kamera und reversible Phasen vollständig', () => {
    for (const entry of MOMENT_REGISTRY) {
      expect(entry.guestCount + Number(entry.includesStaff)).toBeGreaterThan(0);
      expect(entry.cooldownSeconds).toBeGreaterThanOrEqual(60);
      expect(momentDurationSeconds(entry)).toBeGreaterThan(8);
      expect(entry.duration.enter).toBeGreaterThan(0);
      expect(entry.duration.hold).toBeGreaterThan(0);
      expect(entry.duration.return).toBeGreaterThan(0);
      expect(entry.camera).toMatchObject({ approachSeconds: 2.2, recoverSeconds: 2.8, minimumOverviewSeconds: 20, safeFrameInset: 0.1 });
      expect(entry.audioCue.length).toBeGreaterThan(0);
      if (entry.guestCount > 0 && !['doorway-greeting'].includes(entry.kind)) expect(entry.anchorTags.length).toBeGreaterThan(0);
    }
  });

  it('markiert die drei ortstypischen Höhepunkte und Wetterbedingungen', () => {
    expect(MOMENT_REGISTRY.filter((entry) => entry.crescendo).map((entry) => entry.kind)).toEqual([
      'window-rain-trace', 'broth-lid-lift', 'attract-mode-wave',
    ]);
    expect(MOMENT_REGISTRY.find((entry) => entry.kind === 'window-rain-trace')?.weather).toBe('rain');
    expect(MOMENT_REGISTRY.find((entry) => entry.kind === 'noren-gust')?.weather).toBe('wind');
  });
});
