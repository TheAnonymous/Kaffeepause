import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { GuestState } from '../src/simulation/types';
import type { CafeEnvironmentSnapshot, WeatherKind } from '../src/environment/types';
import { observationForOverride } from '../src/environment/weather';

function environment(targetCrowd: number, kind: WeatherKind = 'clear'): CafeEnvironmentSnapshot {
  const localTime = new Date(2026, 6, 14, 12, 30);
  return {
    localTime,
    localTimeText: '12:30',
    minuteOfDay: 750,
    dayPhase: 'midday',
    solar: { elevation: 54, azimuth: 180, isDay: true, isCivilTwilight: false, polarState: 'normal' },
    weather: observationForOverride(kind, localTime),
    weatherSource: 'override',
    locationState: 'override',
    targetCrowd,
  };
}

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

  it('nutzt die erweiterte Kapazität von bis zu acht Gästen', () => {
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
    expect(largest).toBeLessThanOrEqual(9);
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

  it('füllt den Mittagspeak bis acht Gäste mit höchstens sechs Sitzenden', () => {
    const simulation = new CafeSimulation({ seed: 27, initialGuests: 6, minGuests: 0, maxGuests: 8, durationScale: 0.02, accidents: false });
    simulation.setEnvironment(environment(8));
    simulation.start();
    runUntil(simulation, () => simulation.guests.length === 8);
    expect(simulation.guests).toHaveLength(8);
    expect(simulation.guests.filter((guest) => guest.seatId)).toHaveLength(6);
    expect(new Set(simulation.guests.flatMap((guest) => guest.seatId ? [guest.seatId] : [])).size).toBe(6);
  });

  it('senkt die Belegung natürlich ab, ohne neue Gäste zu erzeugen', () => {
    const simulation = new CafeSimulation({ seed: 31, initialGuests: 6, minGuests: 0, maxGuests: 8, durationScale: 0.005, accidents: false });
    simulation.setEnvironment(environment(6));
    simulation.start();
    const arrivals = simulation.stats.arrivals;
    simulation.setEnvironment(environment(0));
    runUntil(simulation, () => simulation.guests.length === 0, 20_000);
    expect(simulation.guests).toHaveLength(0);
    expect(simulation.stats.arrivals).toBe(arrivals);
    expect(simulation.reservations.snapshot().size).toBe(0);
  });

  it('vergibt passende, stabile Wetteraccessoires', () => {
    const simulation = new CafeSimulation({ initialGuests: 4, minGuests: 0, accidents: false });
    simulation.setEnvironment(environment(4, 'snow'));
    simulation.start();
    expect(simulation.guests.every((guest) => guest.accessory === 'scarf' || guest.accessory === 'coat')).toBe(true);
    simulation.setEnvironment(environment(4, 'rain'));
    expect(simulation.guests.some((guest) => guest.accessory === 'umbrella')).toBe(true);
  });
});
