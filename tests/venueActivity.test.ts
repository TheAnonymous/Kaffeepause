import { describe, expect, it } from 'vitest';
import { calculateVenueActivityState } from '../src/scene/venueActivityRenderer';
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

describe('Ortsrequisiten-Zustand', () => {
  it('ordnet tatsächlich belegte Sitze ihren sichtbaren Tischgruppen zu', () => {
    const state = calculateVenueActivityState([
      guest('window', { seatId: 'seat-window-a' }),
      guest('left', { seatId: 'seat-table-a2', activity: 'drinking' }),
      guest('right', { seatId: 'seat-table-b1' }),
      guest('walking', { state: 'walking-to-seat', seatId: 'seat-table-a1' }),
    ]);

    expect(state.seated).toBe(3);
    expect(state.tables).toEqual({ window: 1, left: 1, right: 1 });
    expect(state.drinking).toBe(1);
  });

  it('zeigt Warteschlangen an der Theke, ohne freie Tische zu belegen', () => {
    const state = calculateVenueActivityState([
      guest('queue', { state: 'queueing' }),
      guest('order', { state: 'ordering' }),
      guest('wait', { state: 'waiting' }),
    ]);

    expect(state.waiting).toBe(3);
    expect(state.seated).toBe(0);
    expect(state.tables).toEqual({ window: 0, left: 0, right: 0 });
  });
});
