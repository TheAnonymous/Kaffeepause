import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { CafeMomentKind } from '../src/simulation/types';

function updateUntil(simulation: CafeSimulation, predicate: () => boolean, limit = 2_000): void {
  for (let index = 0; index < limit && !predicate(); index += 1) simulation.update(0.1);
  expect(predicate()).toBe(true);
}

function makeMomentSimulation(kind: CafeMomentKind): CafeSimulation {
  const simulation = new CafeSimulation({
    seed: 81,
    initialGuests: 4,
    minGuests: 0,
    maxGuests: 4,
    accidents: false,
    moments: {
      seed: 23,
      minDelaySeconds: 0.1,
      maxDelaySeconds: 0.1,
      kinds: [kind],
      durationScale: 0.05,
    },
  });
  if (kind === 'ramen-slurp' || kind === 'steam-glasses' || kind === 'chopstick-drop') simulation.setVenue('ramen');
  if (kind === 'arcade-duel' || kind === 'arcade-high-score' || kind === 'ticket-stream' || kind === 'button-mash-sync') simulation.setVenue('arcade');
  simulation.start();
  return simulation;
}

describe('Café-Momente', () => {
  it('plant den ersten stillen Moment deterministisch im Produktionsfenster', () => {
    const left = new CafeSimulation({ seed: 2026, initialGuests: 4, accidents: false });
    const right = new CafeSimulation({ seed: 2026, initialGuests: 4, accidents: false });
    left.start();
    right.start();

    const delay = left.getSecondsUntilNextMoment();
    expect(delay).toBeGreaterThanOrEqual(22);
    expect(delay).toBeLessThanOrEqual(50);
    expect(right.getSecondsUntilNextMoment()).toBe(delay);
  });

  it.each<[CafeMomentKind, number]>([
    ['shared-cake', 2],
    ['card-game', 2],
    ['window-gaze', 1],
    ['sketch-reveal', 1],
    ['coffee-tasting', 1],
    ['ramen-slurp', 1],
    ['arcade-duel', 2],
    ['arcade-high-score', 1],
    ['umbrella-handoff', 2],
    ['foam-moustache', 1],
    ['sugar-packet-domino', 2],
    ['steam-glasses', 1],
    ['chopstick-drop', 1],
    ['ticket-stream', 1],
    ['button-mash-sync', 2],
  ])('%s startet mit passenden Beteiligten und endet sauber', (kind, participants) => {
    const simulation = makeMomentSimulation(kind);
    updateUntil(simulation, () => simulation.activeMoment?.kind === kind);
    expect(simulation.activeMoment?.participantIds).toHaveLength(participants);
    expect(simulation.activeMoment?.duration).toBeGreaterThan(0);
    const activityTimes = new Map(
      simulation.activeMoment?.participantIds.map((id) => [id, simulation.guests.find((guest) => guest.id === id)?.stateTime]),
    );
    simulation.update(0.1);
    for (const [id, stateTime] of activityTimes) {
      expect(simulation.guests.find((guest) => guest.id === id)?.stateTime).toBe(stateTime);
    }

    updateUntil(simulation, () => simulation.stats.momentsCompleted === 1);
    expect(simulation.activeMoment).toBeUndefined();
    expect(simulation.getSecondsUntilNextMoment()).toBeCloseTo(0.1);
  });

  it.each<CafeMomentKind>([
    'foam-moustache', 'sugar-packet-domino', 'steam-glasses',
    'chopstick-drop', 'ticket-stream', 'button-mash-sync',
  ])('%s stellt Tätigkeiten, Wege, Reservierungen und Barista vollständig wieder her', (kind) => {
    const simulation = makeMomentSimulation(kind);
    updateUntil(simulation, () => simulation.activeMoment?.kind === kind);
    const participantIds = simulation.activeMoment?.participantIds ?? [];
    const beforeGuests = participantIds.map((id) => structuredClone(simulation.guests.find((guest) => guest.id === id)));
    const beforeReservations = participantIds.map((id) => simulation.reservations.resourcesOf(id));
    const beforeBarista = structuredClone(simulation.barista);

    updateUntil(simulation, () => simulation.stats.momentsCompleted === 1);
    expect(participantIds.map((id) => simulation.guests.find((guest) => guest.id === id))).toEqual(beforeGuests);
    expect(participantIds.map((id) => simulation.reservations.resourcesOf(id))).toEqual(beforeReservations);
    expect(simulation.barista).toEqual(beforeBarista);
  });

  it('lässt keine kleine Szene parallel zu einem Unfall beginnen', () => {
    const simulation = new CafeSimulation({
      seed: 9,
      initialGuests: 4,
      minGuests: 0,
      maxGuests: 4,
      accidents: { seed: 3, minDelaySeconds: 0.1, maxDelaySeconds: 0.1, kinds: ['tray-drop'], phaseDurationScale: 0.5 },
      moments: { seed: 4, minDelaySeconds: 0.1, maxDelaySeconds: 0.1, kinds: ['shared-cake'], durationScale: 0.1 },
    });
    simulation.start();
    updateUntil(simulation, () => simulation.activeAccident !== undefined);
    expect(simulation.activeMoment).toBeUndefined();
  });

  it('inszeniert Orte unterschiedlich, ohne die normale Sitzlogik zu umgehen', () => {
    const cafe = makeMomentSimulation('coffee-tasting');
    const ramen = makeMomentSimulation('ramen-slurp');
    const arcade = makeMomentSimulation('arcade-duel');

    updateUntil(cafe, () => cafe.activeMoment?.kind === 'coffee-tasting');
    updateUntil(ramen, () => ramen.activeMoment?.kind === 'ramen-slurp');
    updateUntil(arcade, () => arcade.activeMoment?.kind === 'arcade-duel');

    for (const simulation of [cafe, ramen, arcade]) {
      const participants = simulation.activeMoment?.participantIds ?? [];
      expect(participants.every((id) => simulation.guests.find((guest) => guest.id === id)?.state === 'activity')).toBe(true);
    }
  });
});
