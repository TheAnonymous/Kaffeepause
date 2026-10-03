import { describe, expect, it } from 'vitest';
import { benchRestX, canDodgeOntoBench, catMustWait, catStateAt } from '../src/diorama/cafeCat';
import { VENUE_LAYOUTS } from '../src/simulation/layout';
import { worldToDiorama } from '../src/diorama/types';

describe('Mochi nimmt Rücksicht', () => {
  it('bleibt unterwegs stehen, wenn jemand ihr nahe kommt, und läuft weiter, wenn er vorbei ist', () => {
    const clock = 90; // mitten auf dem Weg zum Kuchen
    const state = catStateAt(clock);
    expect(state.pose).toBe('walk');
    expect(catMustWait(state, clock, [{ x: state.position.x + 0.4, z: state.position.z }])).toBe(true);
    expect(catMustWait(state, clock, [{ x: state.position.x + 3, z: state.position.z }])).toBe(false);
    expect(catMustWait(state, clock, [])).toBe(false);
  });

  it('wartet vor dem Losgehen, solange jemand in ihrem Weg steht', () => {
    const clock = 83.8; // kurz bevor sie von der Bank hüpft
    const state = catStateAt(clock);
    expect(state.pose).toBe('sit');
    expect(catMustWait(state, clock, [{ x: -2, z: -1 }])).toBe(true);
    expect(catMustWait(state, clock, [{ x: -2, z: 1.5 }])).toBe(false);
  });

  it('schläft und sitzt sonst ungestört', () => {
    const asleep = catStateAt(20);
    expect(asleep.pose).toBe('sleep');
    expect(catMustWait(asleep, 20, [{ x: asleep.position.x, z: asleep.position.z }])).toBe(false);
    const grooming = catStateAt(120);
    expect(catMustWait(grooming, 120, [{ x: -2, z: -1 }])).toBe(false);
  });

  it('springt zum Ausweichen auf die Bank, aber nie auf einen Sitzplatz und nie neben jemanden, der dort sitzt', () => {
    const seats = VENUE_LAYOUTS.cafe.activitySpots.filter((spot) => spot.kind === 'bench').map((spot) => worldToDiorama(spot).x);
    for (let x = -5.4; x <= -0.9; x += 0.3) {
      const rest = benchRestX(x);
      for (const seat of seats) expect(Math.abs(rest - seat)).toBeGreaterThanOrEqual(0.74);
    }
    const lane = { x: -3, y: 0.08 };
    expect(canDodgeOntoBench(lane, [])).toBe(true);
    expect(canDodgeOntoBench(lane, [{ x: benchRestX(-3), z: -1.72 }])).toBe(false);
    expect(canDodgeOntoBench({ x: 1.5, y: 0.08 }, [])).toBe(false);
    expect(canDodgeOntoBench({ x: -3, y: 0.67 }, [])).toBe(false);
  });
});
