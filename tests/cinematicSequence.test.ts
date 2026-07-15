import { describe, expect, it } from 'vitest';
import {
  CINEMATIC_MOMENT_KINDS,
  CINEMATIC_SEQUENCE_PROFILES,
  cinematicShotHoldTime,
  cinematicSequenceDuration,
  cinematicSequenceProfile,
  sampleCinematicSequence,
  scaleCinematicProfile,
  type CameraTransform,
  type CinematicTransformSet,
} from '../src/diorama/cinematicSequence';

const overview: CameraTransform = {
  position: { x: 2.25, y: 6.7, z: 15.8 },
  target: { x: 2.25, y: 2.55, z: -0.2 },
  fieldOfView: 30,
};

const shots: CinematicTransformSet = {
  establishing: { position: { x: 1, y: 6, z: 13 }, target: { x: 1, y: 2.4, z: 0 }, fieldOfView: 28 },
  detail: { position: { x: 2, y: 4.7, z: 10 }, target: { x: 2, y: 1.4, z: 0 }, fieldOfView: 20 },
  reaction: { position: { x: 1.2, y: 5.2, z: 11 }, target: { x: 1.2, y: 2.3, z: 0 }, fieldOfView: 23 },
};

describe('V3-Kamerasequenzen', () => {
  it('registriert alle 18 Momente mit konkretem Requisitenanker und drei geschützten Shots', () => {
    expect(CINEMATIC_MOMENT_KINDS).toHaveLength(18);
    expect(new Set(CINEMATIC_MOMENT_KINDS).size).toBe(18);
    for (const kind of CINEMATIC_MOMENT_KINDS) {
      const profile = cinematicSequenceProfile(`moment:${kind}`);
      expect(CINEMATIC_SEQUENCE_PROFILES.get(profile.id)).toBe(profile);
      expect(profile.propAnchor).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
      expect(profile.shots.map((shot) => shot.framing)).toEqual(['participants', 'hands-prop', 'faces', 'overview']);
      expect(profile.shots.every((shot) => shot.safeFrameInset === 0.1)).toBe(true);
    }
  });

  it('dauert normal 14,6 und als Höhepunkt 17,4 Sekunden', () => {
    expect(cinematicSequenceDuration(cinematicSequenceProfile('moment:pencil-return'))).toBeCloseTo(14.6);
    expect(cinematicSequenceDuration(cinematicSequenceProfile('moment:window-rain-trace'))).toBeCloseTo(17.4);
  });

  it('bleibt an allen Shotgrenzen stetig und kehrt exakt zur gespeicherten Kamera zurück', () => {
    const profile = cinematicSequenceProfile('moment:pencil-return');
    for (const boundary of [2.2, 4.6, 6, 8, 9.4, 11.8]) {
      const before = sampleCinematicSequence(profile, boundary - 0.0001, overview, overview, shots).transform;
      const after = sampleCinematicSequence(profile, boundary + 0.0001, overview, overview, shots).transform;
      expect(Math.abs(before.position.x - after.position.x)).toBeLessThan(0.002);
      expect(Math.abs(before.position.y - after.position.y)).toBeLessThan(0.002);
      expect(Math.abs(before.fieldOfView - after.fieldOfView)).toBeLessThan(0.01);
    }
    expect(sampleCinematicSequence(profile, 14.6, overview, overview, shots)).toMatchObject({
      shotBeat: 'return', sequenceProgress: 1, amount: 0, transform: overview,
    });
  });

  it('liefert für visuelle Baselines einen stabilen Zeitpunkt in jedem Hold', () => {
    const profile = cinematicSequenceProfile('moment:pencil-return');
    expect(cinematicShotHoldTime(profile, 'establishing')).toBeCloseTo(3.4);
    expect(cinematicShotHoldTime(profile, 'detail')).toBeCloseTo(7);
    expect(cinematicShotHoldTime(profile, 'reaction')).toBeCloseTo(10.6);
    expect(sampleCinematicSequence(profile, cinematicShotHoldTime(profile, 'detail'), overview, overview, shots))
      .toMatchObject({ shotBeat: 'detail', phase: 'focus', amount: 1, transform: shots.detail });
  });

  it('skaliert nur den Testablauf und lässt FOV, Safe Frames und Rückkehr unverändert', () => {
    const profile = scaleCinematicProfile(cinematicSequenceProfile('moment:coop-rescue'), 0.1);
    expect(cinematicSequenceDuration(profile)).toBeCloseTo(1.46);
    expect(profile.shots.map((shot) => shot.fieldOfView)).toEqual([28, 20, 24, 30]);
    expect(sampleCinematicSequence(profile, 1.46, overview, overview, shots).transform).toEqual(overview);
  });
});
