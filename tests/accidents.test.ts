import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { AccidentKind, AccidentPhase, Guest, Point } from '../src/simulation/types';

function updateUntil(simulation: CafeSimulation, predicate: () => boolean, limit = 2_000): void {
  for (let index = 0; index < limit && !predicate(); index += 1) simulation.update(0.1);
  expect(predicate()).toBe(true);
}

function makeAccidentSimulation(kind: AccidentKind): { simulation: CafeSimulation; guest: Guest } {
  const walking = kind === 'umbrella-pop';
  const simulation = new CafeSimulation({
    seed: 31,
    initialGuests: walking ? 0 : 1,
    minGuests: 0,
    maxGuests: 2,
    accidents: {
      seed: 99,
      minDelaySeconds: 0.1,
      maxDelaySeconds: 0.1,
      kinds: [kind],
      phaseDurationScale: 0.08,
    },
  });
  simulation.start();
  const guest = walking ? simulation.spawnGuest() : simulation.guests[0];
  if (!guest) throw new Error('Testgast konnte nicht angelegt werden');
  return { simulation, guest };
}

function point(point: Point): Point {
  return { x: point.x, y: point.y };
}

describe('Cafe-Unfälle', () => {
  it('plant das erste Ereignis deterministisch im Produktionsfenster', () => {
    const left = new CafeSimulation({ seed: 2026, initialGuests: 0 });
    const right = new CafeSimulation({ seed: 2026, initialGuests: 0 });
    left.start();
    right.start();

    const delay = left.getSecondsUntilNextAccident();
    expect(delay).toBeGreaterThanOrEqual(240);
    expect(delay).toBeLessThanOrEqual(420);
    expect(right.getSecondsUntilNextAccident()).toBe(delay);
  });

  it.each<AccidentKind>(['tray-drop', 'coffee-spill', 'umbrella-pop'])('%s durchläuft alle drei Phasen', (kind) => {
    const { simulation } = makeAccidentSimulation(kind);
    const phases = new Set<AccidentPhase>();

    updateUntil(simulation, () => simulation.activeAccident?.kind === kind);
    updateUntil(simulation, () => {
      if (simulation.activeAccident) phases.add(simulation.activeAccident.phase);
      return simulation.stats.accidentsCompleted === 1;
    });

    expect(phases).toEqual(new Set<AccidentPhase>(['startle', 'chaos', 'cleanup']));
    expect(simulation.activeAccident).toBeUndefined();
  });

  it('startet den nächsten Abstand erst nach dem Ende und überlappt nie', () => {
    const { simulation } = makeAccidentSimulation('coffee-spill');
    updateUntil(simulation, () => simulation.stats.accidentsCompleted === 1);

    expect(simulation.activeAccident).toBeUndefined();
    expect(simulation.getSecondsUntilNextAccident()).toBeCloseTo(0.1);
    simulation.update(0.05);
    expect(simulation.activeAccident).toBeUndefined();
    expect(simulation.stats.accidentsCompleted).toBe(1);
    simulation.update(0.05);
    expect(simulation.activeAccident?.id).toBe(2);
  });

  it.each<AccidentKind>(['tray-drop', 'coffee-spill', 'umbrella-pop'])('%s erhält Ziel, Zustandszeit und Reservierungen', (kind) => {
    const { simulation, guest } = makeAccidentSimulation(kind);
    updateUntil(simulation, () => simulation.activeAccident?.kind === kind);
    const targetBefore = point(guest.target);
    const stateBefore = guest.state;
    const stateTimeBefore = guest.stateTime;
    const stateDurationBefore = guest.stateDuration;
    const resourcesBefore = simulation.reservations.resourcesOf(guest.id);

    const frozenTime = guest.stateTime;
    simulation.update(0.1);
    expect(guest.stateTime).toBe(frozenTime);
    updateUntil(simulation, () => simulation.stats.accidentsCompleted === 1);

    expect(guest.state).toBe(stateBefore);
    expect(guest.stateTime).toBe(stateTimeBefore);
    expect(guest.stateDuration).toBe(stateDurationBefore);
    expect(guest.target).toEqual(targetBefore);
    expect(simulation.reservations.resourcesOf(guest.id)).toEqual(resourcesBefore);
    for (const resourceId of resourcesBefore) expect(simulation.reservations.ownerOf(resourceId)).toBe(guest.id);
  });

  it('lässt den Schirmgast wirklich ausweichen und gibt danach sein Originalziel zurück', () => {
    const { simulation, guest } = makeAccidentSimulation('umbrella-pop');
    const targetBefore = point(guest.target);
    updateUntil(simulation, () => simulation.activeAccident?.phase === 'chaos');
    const positionBefore = point(guest.position);
    simulation.update(0.1);

    expect(guest.position).not.toEqual(positionBefore);
    expect(simulation.activeAccident?.detour).toBeDefined();
    updateUntil(simulation, () => simulation.stats.accidentsCompleted === 1);
    expect(guest.target).toEqual(targetBefore);
  });

  it('liefert für gleiche Unfall-Seeds dieselbe Ereignisfolge', () => {
    const make = () => new CafeSimulation({
      seed: 7,
      initialGuests: 1,
      minGuests: 1,
      maxGuests: 1,
      accidents: {
        seed: 51,
        minDelaySeconds: 0.1,
        maxDelaySeconds: 0.1,
        kinds: ['tray-drop', 'coffee-spill'],
        phaseDurationScale: 0.01,
      },
    });
    const collect = (simulation: CafeSimulation): AccidentKind[] => {
      const sequence: AccidentKind[] = [];
      let previousId = 0;
      simulation.start();
      for (let index = 0; index < 200 && sequence.length < 6; index += 1) {
        simulation.update(0.1);
        const accident = simulation.activeAccident;
        if (accident && accident.id !== previousId) {
          previousId = accident.id;
          sequence.push(accident.kind);
        }
      }
      return sequence;
    };

    expect(collect(make())).toEqual(collect(make()));
  });

  it('kann den Scheduler für isolierte Tests vollständig deaktivieren', () => {
    const simulation = new CafeSimulation({ initialGuests: 1, accidents: false });
    simulation.start();
    for (let index = 0; index < 5_000; index += 1) simulation.update(0.1);
    expect(simulation.activeAccident).toBeUndefined();
    expect(simulation.getSecondsUntilNextAccident()).toBeUndefined();
    expect(simulation.stats.accidentsCompleted).toBe(0);
  });
});
