import { describe, expect, it } from 'vitest';
import {
  CameraFocusDirector,
  cameraFocusEase,
  focusFieldOfView,
  participantMidpoint,
  type CameraFocusCandidate,
} from '../src/diorama/cameraFocus';
import { CafeCamera } from '../src/camera';

describe('sanfte Kameraregie', () => {
  const candidate = (
    source: CameraFocusCandidate['source'],
    key: string,
    x: number,
    y = 170,
    participantIds: readonly string[] = [key],
    fieldOfView = 22,
  ): CameraFocusCandidate => ({
    source, key, target: { x, y }, participantIds, targetHeight: 2.7, fieldOfView,
  });

  it('priorisiert Geschichte vor Unfall, Reaktion, Moment und Gespräch', () => {
    const director = new CameraFocusDirector();
    const state = director.update(0, [
      candidate('conversation', 'c', 10),
      candidate('moment', 'm', 20),
      candidate('reaction', 'r', 30),
      candidate('accident', 'a', 40),
      candidate('story', 's', 50),
    ]);
    expect(state).toMatchObject({
      active: true, source: 'story', target: { x: 50, y: 170 }, participantIds: ['s'], fieldOfView: 30,
    });
  });

  it('fährt in 0,9 Sekunden auf 22 Grad und in 1,2 Sekunden zurück', () => {
    const director = new CameraFocusDirector();
    const candidates = [candidate('reaction', '1', 100)];
    director.update(0, candidates);
    expect(director.update(0.9, candidates).fieldOfView).toBeCloseTo(22);
    expect(director.update(2, candidates).fieldOfView).toBeCloseTo(22);
    expect(director.update(3.2, []).active).toBe(false);
    expect(cameraFocusEase(0.5)).toBe(0.5);
  });

  it('fokussiert Gespräche höchstens einmal in 18 Sekunden', () => {
    const director = new CameraFocusDirector();
    director.update(0, [candidate('conversation', '1', 80)]);
    expect(director.update(6, [candidate('conversation', '2', 100)]).active).toBe(false);
    expect(director.update(18, [candidate('conversation', '3', 120)]).source).toBe('conversation');
  });

  it('deaktiviert Fokus vollständig bei Reduced Motion und berechnet Teilnehmermittelpunkte', () => {
    const director = new CameraFocusDirector();
    expect(director.update(0, [candidate('story', '1', 80)], true)).toEqual({
      active: false, participantIds: [], amount: 0, fieldOfView: 30,
    });
    expect(participantMidpoint([{ x: 40, y: 150 }, { x: 80, y: 180 }, { x: 120, y: 210 }])).toEqual({ x: 80, y: 180 });
    expect(participantMidpoint([])).toBeUndefined();
  });

  it('hält Einzelne bei 22 Grad und öffnet räumlich verteilte Gruppen höchstens auf 24 Grad', () => {
    expect(focusFieldOfView([{ x: 80, y: 170 }])).toBe(22);
    expect(focusFieldOfView([{ x: 80, y: 150 }, { x: 120, y: 190 }])).toBeGreaterThan(22);
    expect(focusFieldOfView([
      { x: 40, y: 140 }, { x: 120, y: 170 }, { x: 220, y: 200 }, { x: 300, y: 210 },
    ])).toBe(24);
  });

  it('pausiert die mobile Tour während eines Fokus und setzt ihren Tourzustand danach fort', () => {
    const camera = new CafeCamera();
    camera.configure(112, true, false);
    camera.setFocusPaused(true);
    camera.update(100);
    expect(camera.x).toBe(0);
    camera.setFocusPaused(false);
    camera.update(4.1);
    camera.update(0.1);
    camera.update(6.6);
    camera.update(1);
    expect(camera.x).toBeGreaterThan(0);
  });
});
