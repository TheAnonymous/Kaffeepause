import { describe, expect, it } from 'vitest';
import { VENUE_LAYOUTS } from '../src/simulation/layout';
import {
  buildVenue,
  forwardAxisForSeatOrientation,
  rotationForSeatOrientation,
  validateSeatAlignment,
} from '../src/diorama/venueBuilder';
import { worldToDiorama, type SeatVisualBinding } from '../src/diorama/types';

describe('Sitzmöbel-Ausrichtung', () => {
  it('bindet jeden sitzenden Platz genau einmal und keinen stehenden Arcade-Platz', () => {
    const expectedCounts = { cafe: 6, ramen: 7, arcade: 1 } as const;
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const set = buildVenue(venue);
      const report = validateSeatAlignment(VENUE_LAYOUTS[venue], set.seatBindings);
      const seatedIds = VENUE_LAYOUTS[venue].activitySpots
        .filter((spot) => spot.pose === 'seated')
        .map((spot) => spot.id)
        .sort();

      expect(report).toMatchObject({ valid: true, score: 100, bindingCount: expectedCounts[venue], seatedSpotCount: expectedCounts[venue] });
      expect(report.issues).toEqual([]);
      expect(set.seatBindings.map((binding) => binding.activitySpotId).sort()).toEqual(seatedIds);
      expect(new Set(set.seatBindings.map((binding) => binding.activitySpotId)).size).toBe(expectedCounts[venue]);
      set.dispose();
    }
  });

  it('leitet linke, rechte, vordere und radiale Sitze aus einer gemeinsamen Quelle ab', () => {
    expect(rotationForSeatOrientation('left')).toBe(-Math.PI / 2);
    expect(rotationForSeatOrientation('right')).toBe(Math.PI / 2);
    expect(rotationForSeatOrientation('front')).toBe(0);
    expect(rotationForSeatOrientation('radial')).toBe(0);
    expect(forwardAxisForSeatOrientation('left')).toEqual({ x: -1, z: 0 });
    expect(forwardAxisForSeatOrientation('right')).toEqual({ x: 1, z: 0 });
    expect(forwardAxisForSeatOrientation('front')).toEqual({ x: 0, z: 1 });
    expect(forwardAxisForSeatOrientation('radial')).toEqual({ x: 0, z: 0 });
  });

  it('hält die konkrete Café-a2-Regression nach links ausgerichtet', () => {
    const set = buildVenue('cafe');
    const binding = set.seatBindings.find((entry) => entry.activitySpotId === 'cafe-table-a2');

    expect(VENUE_LAYOUTS.cafe.activitySpots.find((spot) => spot.id === 'cafe-table-a2'))
      .toMatchObject({ facing: -1, seatOrientation: 'left' });
    expect(binding).toMatchObject({
      orientation: 'left',
      transform: { rotation: -Math.PI / 2, forward: { x: -1, z: 0 } },
    });
    expect(binding?.transform.backrestCenter?.x)
      .toBeGreaterThan(binding?.transform.seatCenter.x ?? Number.POSITIVE_INFINITY);
    set.dispose();
  });

  it('setzt Rückenlehnen hinter den Gastanker und lässt radiale Hocker richtungsneutral', () => {
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const set = buildVenue(venue);
      for (const binding of set.seatBindings) {
        const spot = VENUE_LAYOUTS[venue].activitySpots.find((entry) => entry.id === binding.activitySpotId);
        if (!spot || spot.pose !== 'seated' || spot.seatOrientation === 'radial') continue;
        const anchor = worldToDiorama(spot);
        const backrest = binding.transform.backrestCenter;
        expect(backrest, spot.id).toBeDefined();
        const dot = ((backrest?.x ?? 0) - anchor.x) * binding.transform.forward.x
          + ((backrest?.z ?? 0) - anchor.z) * binding.transform.forward.z;
        expect(dot, spot.id).toBeLessThan(-0.05);
      }
      set.dispose();
    }

    const ramen = buildVenue('ramen');
    const radialBindings = ramen.seatBindings.filter((binding) => binding.orientation === 'radial');
    expect(radialBindings).toHaveLength(5);
    const directionNeutral = radialBindings.map((binding) => ({
      ...binding,
      transform: { ...binding.transform, rotation: 2.4, forward: { x: 0.7, z: -0.3 } },
    })) satisfies SeatVisualBinding[];
    const otherBindings = ramen.seatBindings.filter((binding) => binding.orientation !== 'radial');
    expect(validateSeatAlignment(VENUE_LAYOUTS.ramen, [...directionNeutral, ...otherBindings]).valid).toBe(true);
    ramen.dispose();
  });

  it('erkennt fehlende, doppelte, verdrehte und zu weit entfernte Bindungen', () => {
    const set = buildVenue('cafe');
    const first = set.seatBindings[0];
    const left = set.seatBindings.find((binding) => binding.orientation === 'left');
    if (!first || !left) throw new Error('Test-Sitzbindungen fehlen.');
    const broken = set.seatBindings
      .filter((binding) => binding.activitySpotId !== first.activitySpotId)
      .map((binding) => binding === left ? {
        ...binding,
        transform: {
          ...binding.transform,
          rotation: 0,
          seatCenter: { x: binding.transform.seatCenter.x + 2, z: binding.transform.seatCenter.z },
          backrestCenter: binding.transform.seatCenter,
        },
      } : binding);
    broken.push({ ...left });
    const report = validateSeatAlignment(VENUE_LAYOUTS.cafe, broken);

    expect(report.valid).toBe(false);
    expect(report.issues).toContain(`missing-binding:${first.activitySpotId}`);
    expect(report.issues).toContain(`duplicate-binding:${left.activitySpotId}`);
    expect(report.issues).toContain(`rotation:${left.activitySpotId}`);
    expect(report.issues).toContain(`anchor-distance:${left.activitySpotId}`);
    expect(report.issues).toContain(`backrest-position:${left.activitySpotId}`);
    set.dispose();
  });

  it('gibt allen Stühlen, Hockern und Bänken den definierten Kontaktschatten', () => {
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const set = buildVenue(venue);
      for (const binding of set.seatBindings) expect(binding.contactShadow).toEqual({
        overhang: 0.08,
        opacity: 0.18,
        transparent: true,
        depthWrite: false,
      });
      set.dispose();
    }
  });

  it('zeichnet Tischstuhl-Rücken offen aus zwei Streben und einer oberen Leiste', () => {
    for (const venue of ['cafe', 'ramen'] as const) {
      const set = buildVenue(venue);
      for (const binding of set.seatBindings.filter((entry) => entry.kind === 'chair')) {
        const names = binding.partNames;
        expect(names.filter((name) => name === `seat-backrest-slat:${binding.activitySpotId}`)).toHaveLength(2);
        expect(names.filter((name) => name === `seat-backrest-rail:${binding.activitySpotId}`)).toHaveLength(1);
      }
      set.dispose();
    }
  });

  it('hält Lounge-Sitzfläche, Rückenlehne und Cyan-Kante auf den geprüften Tiefen', () => {
    const set = buildVenue('arcade');
    const binding = set.seatBindings.find((entry) => entry.activitySpotId === 'arcade-lounge');
    const names = binding?.partNames ?? [];

    expect(binding).toMatchObject({
      orientation: 'front',
      transform: { seatCenter: { x: 0, z: 2.18 }, backrestCenter: { x: 0, z: 1.88 } },
    });
    expect(names).toContain('seat-edge:arcade-lounge');
    set.dispose();
  });
});
