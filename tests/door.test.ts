import { describe, expect, it } from 'vitest';
import { doorTargetForGuests } from '../src/scene/doorRenderer';
import type { Guest } from '../src/simulation/types';

function guest(id: string, overrides: Partial<Guest>): Guest {
  return {
    id,
    name: id,
    state: 'activity',
    activity: 'reading',
    position: { x: 100, y: 187 },
    target: { x: 100, y: 187 },
    facing: 1,
    speed: 0,
    stateTime: 0,
    stateDuration: 20,
    animation: 0,
    activityRounds: 0,
    palette: { skin: '#f0c6a0', hair: '#34252a', coat: '#5f766f', accent: '#e5bb72' },
    ...overrides,
  };
}

describe('Eingangstür', () => {
  it('öffnet vollständig für Gäste am tatsächlichen Eingang', () => {
    expect(doorTargetForGuests([
      guest('arrival', { state: 'entering', position: { x: 24, y: 188 } }),
    ])).toBe(1);
  });

  it('reagiert nur auf ein- und ausgehende Gäste im Eingangskorridor', () => {
    const approaching = doorTargetForGuests([
      guest('departure', { state: 'walking-to-exit', position: { x: -12, y: 188 } }),
    ]);
    const seated = doorTargetForGuests([
      guest('seated', { state: 'activity', position: { x: 24, y: 188 } }),
    ]);
    const wrongLane = doorTargetForGuests([
      guest('wrong-lane', { state: 'entering', position: { x: 24, y: 130 } }),
    ]);

    expect(approaching).toBeGreaterThan(0);
    expect(seated).toBe(0);
    expect(wrongLane).toBe(0);
  });
});
