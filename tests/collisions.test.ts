import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import { CAFE_COLLIDERS, GUEST_RADIUS, pointHitsCafeCollider } from '../src/simulation/layout';

describe('Café-Kollisionen', () => {
  it('markiert große Möbel als feste Hindernisse und lässt Zugänge frei', () => {
    expect(CAFE_COLLIDERS.map((collider) => collider.id)).toEqual(expect.arrayContaining([
      'left-wall', 'door', 'window-bench', 'window-table-left', 'window-table-right', 'counter',
    ]));
    expect(pointHitsCafeCollider({ x: 320, y: 170 })).toBe(true);
    expect(pointHitsCafeCollider({ x: 270, y: 173 })).toBe(false);
    expect(pointHitsCafeCollider({ x: 320, y: 120 })).toBe(false);
    expect(pointHitsCafeCollider({ x: 24, y: 90 })).toBe(true);
    expect(pointHitsCafeCollider({ x: 24, y: 188 })).toBe(false);
  });

  it('führt einen Gast um Möbel herum und bis vor die Tür', () => {
    const simulation = new CafeSimulation({
      seed: 42,
      initialGuests: 0,
      minGuests: 0,
      maxGuests: 1,
      durationScale: 0.01,
      accidents: false,
      moments: false,
      stories: false,
    });
    simulation.start();
    simulation.spawnGuest();

    for (let index = 0; index < 10_000 && simulation.stats.departures === 0; index += 1) {
      simulation.update(0.1);
      for (const guest of simulation.guests) {
        expect(pointHitsCafeCollider(guest.position, GUEST_RADIUS)).toBe(false);
      }
    }
    expect(simulation.stats.departures).toBe(1);
  });
});
