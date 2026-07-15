import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueKind, VENUE_KINDS, VENUES } from '../src/venue';
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
