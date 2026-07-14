import { describe, expect, it } from 'vitest';
import {
  CameraFocusDirector,
  cameraFocusEase,
  participantMidpoint,
} from '../src/diorama/cameraFocus';
import { CafeCamera } from '../src/camera';

describe('sanfte Kameraregie', () => {
  it('priorisiert Geschichte vor Unfall, Reaktion, Moment und Gespräch', () => {
    const director = new CameraFocusDirector();
    const state = director.update(0, [
      { source: 'conversation', key: 'c', worldX: 10 },
      { source: 'moment', key: 'm', worldX: 20 },
      { source: 'reaction', key: 'r', worldX: 30 },
      { source: 'accident', key: 'a', worldX: 40 },
      { source: 'story', key: 's', worldX: 50 },
    ]);
    expect(state).toMatchObject({ active: true, source: 'story', worldX: 50, fieldOfView: 30 });
  });

  it('fährt in 0,9 Sekunden auf 24 Grad und in 1,2 Sekunden zurück', () => {
    const director = new CameraFocusDirector();
    const candidate = [{ source: 'reaction' as const, key: '1', worldX: 100 }];
    director.update(0, candidate);
    expect(director.update(0.9, candidate).fieldOfView).toBeCloseTo(24);
    expect(director.update(2, candidate).fieldOfView).toBeCloseTo(24);
    expect(director.update(3.2, []).active).toBe(false);
    expect(cameraFocusEase(0.5)).toBe(0.5);
  });

  it('fokussiert Gespräche höchstens einmal in 18 Sekunden', () => {
    const director = new CameraFocusDirector();
    director.update(0, [{ source: 'conversation', key: '1', worldX: 80 }]);
    expect(director.update(6, [{ source: 'conversation', key: '2', worldX: 100 }]).active).toBe(false);
    expect(director.update(18, [{ source: 'conversation', key: '3', worldX: 120 }]).source).toBe('conversation');
  });

  it('deaktiviert Fokus vollständig bei Reduced Motion und berechnet Teilnehmermittelpunkte', () => {
    const director = new CameraFocusDirector();
    expect(director.update(0, [{ source: 'story', key: '1', worldX: 80 }], true)).toEqual({
      active: false, amount: 0, fieldOfView: 30,
    });
    expect(participantMidpoint([40, 80, 120])).toBe(80);
    expect(participantMidpoint([])).toBeUndefined();
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
