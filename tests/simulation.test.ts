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
    for (const state of [
      'entering', 'queueing', 'ordering', 'waiting', 'walking-to-seat', 'activity', 'walking-to-exit', 'exiting',
    ] satisfies readonly GuestState[]) expect(states).toContain(state);
    expect(simulation.reservations.resourcesOf(guest?.id ?? '')).toEqual([]);
  });

  it.each([['cafe', 4, 6], ['ramen', 5, 7], ['arcade', 4, 7]] as const)(
    'hält die Zielbelegung in %s zwischen %i und %i Gästen',
    (venue, minimum, maximum) => {
      const simulation = new CafeSimulation({ venue, seed: 11, durationScale: 0.02 });
      simulation.start();
      for (let index = 0; index < 5_000; index += 1) simulation.update(0.1);
      expect(simulation.guests.length, JSON.stringify({
        venue,
        guests: simulation.guests.map((guest) => ({
          id: guest.id, state: guest.state, destination: guest.destinationId, position: guest.position,
        })),
        target: simulation.crowdTarget,
        navigation: simulation.getSceneSnapshot().navigation,
        reservations: [...simulation.reservations.snapshot()],
      })).toBeGreaterThanOrEqual(minimum);
      expect(simulation.guests.length).toBeLessThanOrEqual(maximum);
      expect(simulation.stats.arrivals).toBeGreaterThanOrEqual(minimum);
      expect(simulation.stats.departures).toBeGreaterThan(0);
    },
  );

  it('reserviert jeden Sitz höchstens einmal und gibt ihn beim Aufstehen frei', () => {
    const simulation = new CafeSimulation({ seed: 91, initialGuests: 1, minGuests: 0, maxGuests: 1, durationScale: 0.01 });
    simulation.start();
    const guest = simulation.guests[0];
    const activitySpotId = guest?.activitySpotId;
    expect(activitySpotId).toBeDefined();
    expect(simulation.reservations.ownerOf(activitySpotId ?? '')).toBe(guest?.id);

    runUntil(simulation, () => guest?.state === 'walking-to-exit');
    expect(simulation.reservations.ownerOf(activitySpotId ?? '')).toBeUndefined();
    expect(new Set(simulation.guests.flatMap((item) => item.activitySpotId ? [item.activitySpotId] : [])).size)
      .toBe(simulation.guests.filter((item) => item.activitySpotId).length);
  });

  it('startet und stoppt idempotent', () => {
    const simulation = new CafeSimulation({ initialGuests: 4 });
    simulation.start();
    simulation.start();
    expect(simulation.guests).toHaveLength(4);
    const guestIds = simulation.guests.map((guest) => guest.id);
    simulation.stop();
    const elapsed = simulation.stats.elapsed;
    simulation.update(10);
    expect(simulation.stats.elapsed).toBe(elapsed);
    expect(() => simulation.start()).not.toThrow();
    expect(simulation.guests.map((guest) => guest.id)).toEqual(guestIds);
    expect(simulation.guests).toHaveLength(4);
  });

  it('begrenzt den Café-Mittagspeak auf seine sechs Aktivitätsplätze', () => {
    const simulation = new CafeSimulation({ seed: 27, initialGuests: 6, minGuests: 0, maxGuests: 8, durationScale: 0.02, accidents: false });
    simulation.setEnvironment(environment(8));
    simulation.start();
    runUntil(simulation, () => simulation.guests.length === 6);
    expect(simulation.guests).toHaveLength(6);
    expect(simulation.guests.filter((guest) => guest.activitySpotId)).toHaveLength(6);
    expect(new Set(simulation.guests.flatMap((guest) => guest.activitySpotId ? [guest.activitySpotId] : [])).size).toBe(6);
  });

  it('senkt die Belegung natürlich ab, ohne neue Gäste zu erzeugen', () => {
    const simulation = new CafeSimulation({ seed: 31, initialGuests: 6, minGuests: 0, maxGuests: 8, durationScale: 0.005, accidents: false });
    simulation.setEnvironment(environment(6));
    simulation.start();
    const arrivals = simulation.stats.arrivals;
    simulation.setEnvironment(environment(0));
    runUntil(simulation, () => simulation.guests.length === 0, 20_000);
    expect(simulation.guests, JSON.stringify({
      guests: simulation.guests.map((guest) => ({
        id: guest.id, state: guest.state, position: guest.position, target: guest.target,
        waypoints: guest.waypoints, route: guest.movementRouteId,
      })),
      navigation: simulation.getSceneSnapshot().navigation,
      reservations: [...simulation.reservations.snapshot()],
    })).toHaveLength(0);
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
