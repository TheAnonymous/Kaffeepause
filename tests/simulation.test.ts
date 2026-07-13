import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { GuestState } from '../src/simulation/types';

function runUntil(simulation: CafeSimulation, predicate: () => boolean, limit = 8_000): void {
  for (let index = 0; index < limit && !predicate(); index += 1) simulation.update(0.1);
}

describe('CafeSimulation', () => {
  it('führt einen Gast durch Bestellen, Tätigkeit und Verlassen', () => {
    const simulation = new CafeSimulation({ seed: 42, initialGuests: 0, minGuests: 0, maxGuests: 1, durationScale: 0.01 });
    simulation.start();
    const guest = simulation.spawnGuest();
    expect(guest).toBeDefined();
    const states = new Set<GuestState>();

    for (let index = 0; index < 10_000 && simulation.stats.departures === 0; index += 1) {
      if (guest) states.add(guest.state);
      simulation.update(0.1);
    }
    expect(simulation.stats.departures).toBe(1);
    expect(guest?.state).toBe('exiting');
    expect(states).toEqual(new Set<GuestState>(['entering', 'queueing', 'ordering', 'waiting', 'walking-to-seat', 'activity', 'walking-to-exit', 'exiting']));
    expect(simulation.reservations.resourcesOf(guest?.id ?? '')).toEqual([]);
  });

  it('bleibt einschließlich Barista bei fünf bis sieben sichtbaren Figuren', () => {
    const simulation = new CafeSimulation({ seed: 11, durationScale: 0.02 });
    simulation.start();
    let smallest = Number.POSITIVE_INFINITY;
    let largest = 0;
    for (let index = 0; index < 5_000; index += 1) {
      simulation.update(0.1);
      if (index > 20) {
        smallest = Math.min(smallest, simulation.guests.length + 1);
        largest = Math.max(largest, simulation.guests.length + 1);
      }
    }
    expect(smallest).toBeGreaterThanOrEqual(5);
    expect(largest).toBeLessThanOrEqual(7);
    expect(simulation.stats.arrivals).toBeGreaterThan(4);
    expect(simulation.stats.departures).toBeGreaterThan(0);
  });

  it('reserviert jeden Sitz höchstens einmal und gibt ihn beim Aufstehen frei', () => {
    const simulation = new CafeSimulation({ seed: 91, initialGuests: 1, minGuests: 0, maxGuests: 1, durationScale: 0.01 });
    simulation.start();
    const guest = simulation.guests[0];
    const seatId = guest?.seatId;
    expect(seatId).toBeDefined();
    expect(simulation.reservations.ownerOf(seatId ?? '')).toBe(guest?.id);

    runUntil(simulation, () => guest?.state === 'walking-to-exit');
    expect(simulation.reservations.ownerOf(seatId ?? '')).toBeUndefined();
    expect(new Set(simulation.guests.flatMap((item) => item.seatId ? [item.seatId] : [])).size)
      .toBe(simulation.guests.filter((item) => item.seatId).length);
  });

  it('startet und stoppt idempotent', () => {
    const simulation = new CafeSimulation({ initialGuests: 4 });
    simulation.start();
    simulation.start();
    expect(simulation.guests).toHaveLength(4);
    simulation.stop();
    const elapsed = simulation.stats.elapsed;
    simulation.update(10);
    expect(simulation.stats.elapsed).toBe(elapsed);
  });
});
