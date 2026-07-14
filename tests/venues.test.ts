import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueKind, VENUE_KINDS, VENUES } from '../src/venue';

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
});
