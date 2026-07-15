import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import {
  GUEST_RADIUS,
  VENUE_LAYOUTS,
  pointHitsVenueCollider,
  routeIsClear,
} from '../src/simulation/layout';
import type { VenueKind } from '../src/venue';

describe('Venue-Kollisionen und Laufwege', () => {
  it.each(['cafe', 'ramen', 'arcade'] as const)('%s hält Eingang, Laufziele und Aktivitätsplätze frei', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    expect(pointHitsVenueCollider(layout, layout.entrance)).toBe(false);
    for (const place of [...layout.queuePlaces, ...layout.waitPlaces, ...layout.activitySpots]) {
      expect(pointHitsVenueCollider(layout, place, GUEST_RADIUS)).toBe(false);
      expect(routeIsClear(layout, layout.entrance, place)).toBe(true);
    }
  });

  it.each(['cafe', 'ramen', 'arcade'] as const)('%s führt einen Gast vollständig hinein und kollisionsfrei wieder hinaus', (venue: VenueKind) => {
    const simulation = new CafeSimulation({
      venue, seed: 42, initialGuests: 0, minGuests: 0, maxGuests: 1, durationScale: 0.01,
      accidents: false, moments: false, stories: false,
    });
    simulation.start();
    const guest = simulation.spawnGuest();
    const states = new Set<string>();
    for (let index = 0; index < 14_000 && simulation.stats.departures === 0; index += 1) {
      if (guest) states.add(guest.state);
      simulation.update(0.1);
      for (const current of simulation.guests) {
        expect(pointHitsVenueCollider(VENUE_LAYOUTS[venue], current.position, GUEST_RADIUS)).toBe(false);
      }
    }
    expect(states).toContain('activity');
    expect(simulation.stats.departures).toBe(1);
  });
});
