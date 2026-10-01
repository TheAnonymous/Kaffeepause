import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueKind, venueEyebrow, venueStatus, VENUE_KINDS, VENUES } from '../src/venue';
import { worldToDiorama } from '../src/diorama/types';
import { VENUE_LAYOUTS } from '../src/simulation/layout';
import { CafeSimulation } from '../src/simulation/cafeSimulation';

describe('Ortswahl', () => {
  it('bietet Café, Ramen-Restaurant und Arcade-Halle mit eigenen Einstiegstexten', () => {
    expect(VENUE_KINDS).toEqual(['cafe', 'ramen', 'arcade']);
    expect(DEFAULT_VENUE).toBe('cafe');
    expect(VENUES.cafe.enterLabel).toMatch(/Café/);
    expect(VENUES.ramen.enterLabel).toMatch(/Ramen/);
    expect(VENUES.arcade.enterLabel).toMatch(/Arcade/);
    expect(new Set(Object.values(VENUES).map((venue) => venue.canvasLabel)).size).toBe(3);
  });

  it('akzeptiert nur bekannte Ortskennungen', () => {
    expect(isVenueKind('cafe')).toBe(true);
    expect(isVenueKind('ramen')).toBe(true);
    expect(isVenueKind('arcade')).toBe(true);
    expect(isVenueKind('restaurant')).toBe(false);
    expect(isVenueKind(undefined)).toBe(false);
  });

  it('definiert drei eigenständige Grundrisse mit passenden Eingangsflüssen und Kapazitäten', () => {
    expect(VENUE_LAYOUTS.cafe).toMatchObject({ entryFlow: 'left', population: { min: 4, max: 6 } });
    expect(VENUE_LAYOUTS.ramen).toMatchObject({ entryFlow: 'right', population: { min: 5, max: 7 } });
    expect(VENUE_LAYOUTS.arcade).toMatchObject({ entryFlow: 'rear', population: { min: 4, max: 7 } });
    expect(VENUE_LAYOUTS.cafe.activitySpots.map((spot) => spot.kind)).toEqual(['bench', 'bench', 'table', 'table', 'table', 'table']);
    expect(VENUE_LAYOUTS.ramen.activitySpots.filter((spot) => spot.kind === 'counter-stool')).toHaveLength(5);
    expect(VENUE_LAYOUTS.arcade.activitySpots.filter((spot) => spot.kind === 'arcade-cabinet')).toHaveLength(6);
  });

  it('wechselt das Layout nur vor dem Simulationsstart', () => {
    const simulation = new CafeSimulation({ initialGuests: 0, accidents: false, moments: false, stories: false });
    simulation.setVenue('ramen');
    expect(simulation.getSceneSnapshot().venue).toBe('ramen');
    simulation.start();
    simulation.setVenue('arcade');
    expect(simulation.getSceneSnapshot().venue).toBe('ramen');
  });
});

describe('Abstände im Raum', () => {
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const left = worldToDiorama(a);
    const right = worldToDiorama(b);
    return Math.hypot(left.x - right.x, left.z - right.z);
  };

  it.each(VENUE_KINDS)('%s: Warte- und Durchgangspunkte stehen nicht auf besetzten Plätzen', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    const standing = [...layout.queuePlaces, ...layout.waitPlaces, ...layout.passingPlaces];
    for (const place of standing) {
      for (const seat of layout.activitySpots) {
        expect(apart(place, seat), `${place.id} ↔ ${seat.id}`).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it.each(VENUE_KINDS)('%s: Wartende in der Schlange stehen nicht ineinander', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    for (const [index, place] of layout.queuePlaces.entries()) {
      for (const other of layout.queuePlaces.slice(index + 1)) {
        expect(apart(place, other), `${place.id} ↔ ${other.id}`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });
});

describe('Texte zum Ort und Wetter', () => {
  it('beschreibt im Café, was draußen wirklich zu sehen ist', () => {
    expect(venueEyebrow('cafe', 'rain', 'midday')).toBe('Ein kleiner Regentag');
    expect(venueEyebrow('cafe', 'clear', 'midday')).toBe('Sonne auf den Tassen');
    expect(venueEyebrow('cafe', 'clear', 'night')).toBe('Eine stille Nacht');
    expect(venueStatus('cafe', 'clear')).not.toMatch(/Regen/);
    expect(venueStatus('cafe', 'rain')).toMatch(/Regen/);
  });

  it('lässt Ramen und Arcade bei ihrem festen Text', () => {
    expect(venueEyebrow('ramen', 'clear', 'midday')).toBe(VENUES.ramen.eyebrow);
    expect(venueStatus('arcade', 'snow')).toBe(VENUES.arcade.statusMessage);
  });
});
