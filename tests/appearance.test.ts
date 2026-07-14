import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_LIBRARY_REPORT,
  GUEST_APPEARANCE_PRESETS,
  geometryForGuest,
  validateAppearanceLibrary,
} from '../src/simulation/appearance';
import { CafeSimulation } from '../src/simulation/cafeSimulation';

describe('Figurenvariation', () => {
  it('liefert zwölf eigenständige Silhouetten mit vollständiger Haar-, Körper- und Outfitbreite', () => {
    expect(APPEARANCE_LIBRARY_REPORT).toEqual(validateAppearanceLibrary());
    expect(APPEARANCE_LIBRARY_REPORT.valid).toBe(true);
    expect(APPEARANCE_LIBRARY_REPORT.score).toBe(100);
    expect(APPEARANCE_LIBRARY_REPORT.uniqueSilhouettes).toBe(12);
    expect(new Set(GUEST_APPEARANCE_PRESETS.map((appearance) => appearance.hair)).size).toBe(8);
    expect(new Set(GUEST_APPEARANCE_PRESETS.map((appearance) => appearance.outfit)).size).toBe(6);
    expect(new Set(GUEST_APPEARANCE_PRESETS.map((appearance) => appearance.body)).size).toBe(5);
  });

  it('hält jede Variante innerhalb der gemeinsamen Tisch- und Kollisionsproportionen', () => {
    for (const appearance of GUEST_APPEARANCE_PRESETS) {
      const standing = geometryForGuest(appearance, false);
      const seated = geometryForGuest(appearance, true);
      expect(standing.bodyWidth).toBeGreaterThanOrEqual(11.5);
      expect(standing.bodyWidth).toBeLessThanOrEqual(14.5);
      expect(standing.bodyHeight + standing.headHeight).toBeLessThanOrEqual(33.5);
      expect(seated.bodyHeight + seated.headHeight).toBeLessThanOrEqual(25.5);
    }
  });

  it('gibt den sechs Stammgästen stabil unterscheidbare Erscheinungen', () => {
    const simulation = new CafeSimulation({ seed: 27, initialGuests: 6, minGuests: 0, maxGuests: 6, accidents: false, moments: false, stories: false });
    simulation.start();
    const snapshot = simulation.getSceneSnapshot();
    const signatures = snapshot.guests.map((guest) => `${guest.appearance.body}:${guest.appearance.hair}:${guest.appearance.outfit}:${guest.appearance.detail}`);

    expect(new Set(signatures).size).toBe(6);
    expect(snapshot.guests.every((guest) => Object.isFrozen(guest.appearance))).toBe(true);
  });
});
