import { describe, expect, it } from 'vitest';
import {
  CameraFocusDirector,
  calculateFocusFrameBounds,
  cameraFocusEase,
  focusFieldOfView,
  participantMidpoint,
  type CameraFocusCandidate,
} from '../src/diorama/cameraFocus';
import { CafeCamera } from '../src/camera';
import { VENUE_LAYOUTS } from '../src/simulation/layout';
import { VENUE_VISUAL_PROFILES, focusBoundsAreSafe } from '../src/diorama/visualProfiles';

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

  it('fährt in 2,2 Sekunden auf 22 Grad, hält und kehrt in 2,8 Sekunden zurück', () => {
    const director = new CameraFocusDirector();
    const candidates = [candidate('reaction', '1', 100)];
    director.update(0, candidates);
    expect(director.update(1.1, candidates).phase).toBe('approach');
    expect(director.update(2.2, candidates).fieldOfView).toBeCloseTo(22);
    expect(director.update(5.4, candidates).phase).toBe('recover');
    expect(director.update(8.2, []).active).toBe(false);
    expect(director.update(8.2, []).fieldOfView).toBe(30);
    expect(cameraFocusEase(0.5)).toBe(0.5);
  });

  it('übergibt weich an ein höher priorisiertes Ereignis, ohne die Rig-Position springen zu lassen', () => {
    const director = new CameraFocusDirector();
    const conversation = [candidate('conversation', 'c', 80)];
    const before = director.update(1.1, conversation);
    const handedOver = director.update(1.1, [...conversation, candidate('story', 's', 180)]);
    expect(handedOver).toMatchObject({ source: 'story', phase: 'approach' });
    expect(handedOver.amount).toBeCloseTo(before.amount);
    expect(handedOver.target).toEqual(before.target);
    expect(handedOver.fieldOfView).toBeCloseTo(before.fieldOfView);
    expect(director.update(3.31, [candidate('story', 's', 180)])).toMatchObject({
      source: 'story', phase: 'focus', amount: 1, target: { x: 180, y: 170 }, fieldOfView: 22,
    });
  });

  it('hält nach der identischen Rückkehr mindestens 20 Sekunden Übersicht', () => {
    const director = new CameraFocusDirector();
    director.update(0, [candidate('conversation', '1', 80)]);
    expect(director.update(6, [candidate('conversation', '2', 100)]).active).toBe(true);
    expect(director.update(10, [candidate('conversation', '2', 100)]).active).toBe(false);
    expect(director.update(29.1, [candidate('conversation', '2', 100)]).active).toBe(false);
    expect(director.update(30, [candidate('conversation', '3', 120)]).source).toBe('conversation');
  });

  it('deaktiviert Fokus vollständig bei Reduced Motion und berechnet Teilnehmermittelpunkte', () => {
    const director = new CameraFocusDirector();
    expect(director.update(0, [candidate('story', '1', 80)], true)).toEqual({
      active: false, phase: 'overview', participantIds: [], amount: 0, fieldOfView: 30,
    });
    expect(participantMidpoint([{ x: 40, y: 150 }, { x: 80, y: 180 }, { x: 120, y: 210 }])).toEqual({ x: 80, y: 180 });
    expect(participantMidpoint([])).toBeUndefined();
  });

  it('hält Einzelne bei 22 Grad und öffnet räumlich verteilte Gruppen höchstens auf 26 Grad', () => {
    expect(focusFieldOfView([{ x: 80, y: 170 }])).toBe(22);
    expect(focusFieldOfView([{ x: 80, y: 150 }, { x: 120, y: 190 }])).toBeGreaterThan(22);
    expect(focusFieldOfView([
      { x: 40, y: 140 }, { x: 120, y: 170 }, { x: 220, y: 200 }, { x: 300, y: 210 },
    ])).toBe(26);
  });

  it('fasst Teilnehmer, Hände/Requisiten und Sprechblasen in einem sicheren Bildrahmen zusammen', () => {
    const bounds = calculateFocusFrameBounds([
      { role: 'participant', left: 0.28, top: 0.24, right: 0.54, bottom: 0.86 },
      { role: 'hands-prop', left: 0.22, top: 0.5, right: 0.61, bottom: 0.72 },
      { role: 'speech-bubble', left: 0.34, top: 0.1, right: 0.68, bottom: 0.31 },
    ]);
    expect(bounds).toMatchObject({ left: 0.22, top: 0.1, right: 0.68, bottom: 0.86 });
    expect(bounds?.width).toBeCloseTo(0.46);
    expect(bounds?.height).toBeCloseTo(0.76);
    expect(bounds && focusBoundsAreSafe(bounds, VENUE_VISUAL_PROFILES.cafe.camera.safeArea)).toBe(true);
  });

  it.each(['cafe', 'ramen', 'arcade'] as const)('hält alle Aktivitätsplätze in %s für Desktop und Mobil im Fokus-FOV', (venue) => {
    const positions = VENUE_LAYOUTS[venue].activitySpots.map((spot) => ({ x: spot.x, y: spot.y }));
    for (const position of positions) expect(focusFieldOfView([position])).toBe(22);
    for (const viewport of [{ width: 1440, height: 810 }, { width: 390, height: 844 }]) {
      const maxGroupSize = viewport.width < 700 ? 2 : 4;
      for (let index = 0; index < positions.length; index += 1) {
        const group = positions.slice(index, index + maxGroupSize);
        if (group.length > 0) {
          expect(focusFieldOfView(group)).toBeGreaterThanOrEqual(22);
          expect(focusFieldOfView(group)).toBeLessThanOrEqual(26);
        }
      }
    }
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
