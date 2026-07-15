import { describe, expect, it } from 'vitest';
import { MOMENT_REGISTRY, momentDurationSeconds, venueMomentPool } from '../src/simulation/momentRegistry';
import { cinematicSequenceDuration, cinematicSequenceProfile } from '../src/diorama/cinematicSequence';

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
      const camera = cinematicSequenceProfile(entry.camera);
      expect(camera.minimumOverviewSeconds).toBe(20);
      expect(camera.shots.map((shot) => shot.beat)).toEqual(['establishing', 'detail', 'reaction', 'return']);
      expect(camera.shots.map((shot) => shot.transitionSeconds)).toEqual([2.2, 1.4, 1.4, 2.8]);
      expect(camera.shots.every((shot) => shot.safeFrameInset === 0.1)).toBe(true);
      expect(cinematicSequenceDuration(camera)).toBeCloseTo(entry.crescendo ? 17.4 : 14.6);
      expect(entry.propAnchor).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
      expect(entry.cues.filter((cue) => cue.type === 'foley')).toHaveLength(2);
      expect(entry.cues.filter((cue) => cue.type === 'light')).toHaveLength(1);
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
