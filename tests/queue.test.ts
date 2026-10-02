import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { VenueKind } from '../src/venue';

// Früher blieben ganze Schlangen minutenlang stehen: Neue Gäste bekamen einen freien Platz vorn, kamen an den
// Wartenden nicht vorbei, und alle steckten fest. Diese Läufe stammen aus solchen Fällen.

describe('Schlange und Gänge', () => {
  it.each([
    ['cafe', 5], ['cafe', 11], ['ramen', 11], ['arcade', 9],
  ] as const satisfies readonly (readonly [VenueKind, number])[])('%s (Seed %i): Kein Gast steht minutenlang still', (venue, seed) => {
    const simulation = new CafeSimulation({ venue, seed, durationScale: 0.08 });
    simulation.start();
    const since = new Map<string, { state: string; time: number }>();
    let longest = 0;
    for (let frame = 0; frame < 20 * 600; frame += 1) {
      simulation.update(0.05);
      const now = frame / 20;
      for (const guest of simulation.guests) {
        const waiting = guest.state !== 'activity' && guest.state !== 'scene-pause' && guest.state !== 'entering' && guest.state !== 'exiting';
        const entry = since.get(guest.id);
        if (!waiting || !entry || entry.state !== guest.state) since.set(guest.id, { state: guest.state, time: now });
        else longest = Math.max(longest, now - entry.time);
      }
    }
    expect(longest).toBeLessThan(120);
    expect(simulation.stats.arrivals).toBeGreaterThan(30);
  }, 60_000);

  it('lässt niemanden vordrängeln: Ein neuer Gast stellt sich hinten an, nie in eine Lücke vorn', () => {
    const simulation = new CafeSimulation({ venue: 'cafe', seed: 3, initialGuests: 0, minGuests: 0, maxGuests: 6, accidents: false, moments: false, stories: false });
    simulation.start();
    const first = simulation.spawnGuest();
    const second = simulation.spawnGuest();
    const third = simulation.spawnGuest();
    expect([first, second, third].map((guest) => guest?.destinationId)).toEqual(['cafe-queue-0', 'cafe-queue-1', 'cafe-queue-2']);
  });
});
