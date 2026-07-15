import { describe, expect, it } from 'vitest';
import {
  calculateGuestVisualState,
  characterFrameAt,
  poseForGuest,
} from '../src/diorama/characterVisualState';
import type { Guest } from '../src/simulation/types';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1', name: 'Mara', state: 'activity', activity: 'reading',
    position: { x: 100, y: 180 }, target: { x: 100, y: 180 }, facing: 1,
    speed: 20, stateTime: 0, stateDuration: 20, animation: 0, activityRounds: 0,
    palette: { skin: '#d8a071', hair: '#3a252b', coat: '#557b78', accent: '#e5b568', trousers: '#343b46', shoes: '#171820' },
    appearance: { body: 'soft', face: 'round', hair: 'bun', outfit: 'cardigan', detail: 'freckles', maturity: 'adult', heightOffset: 0, widthOffset: 0.5, pattern: 0 },
    ...overrides,
  };
}

describe('zentraler Figurenstatus', () => {
  it('ordnet Gehen, Warten, Bestellen und alle Tätigkeiten einer Pose zu', () => {
    expect(poseForGuest(guest({ state: 'walking-to-seat' }))).toBe('walking');
    expect(poseForGuest(guest({ state: 'waiting' }))).toBe('waiting');
    expect(poseForGuest(guest({ state: 'ordering' }))).toBe('ordering');
    for (const activity of ['reading', 'typing', 'talking', 'drinking', 'phone', 'sketching', 'journaling', 'knitting', 'board-game'] as const) {
      expect(poseForGuest(guest({ activity }))).toBe(activity);
    }
  });

  it('taktet vier Frames deterministisch mit 6, 4 und 3 Bildern pro Sekunde', () => {
    for (const frameRate of [6, 4, 3]) {
      const sequence = Array.from({ length: 4 }, (_, index) => characterFrameAt(index / frameRate, frameRate));
      expect(sequence).toEqual([0, 1, 2, 3]);
      expect(characterFrameAt(4 / frameRate, frameRate)).toBe(0);
    }
  });

  it('zeigt bei Reduced Motion die statische Schlüsselpose', () => {
    expect(characterFrameAt(0, 6, 'mara', true, 2)).toBe(2);
    expect(characterFrameAt(500, 6, 'mara', true, 2)).toBe(2);
  });

  it('priorisiert Geschichten, Unfälle, Reaktionen und normale Momente in der Darstellung', () => {
    const mara = guest();
    const base = { guest: mara, time: 1, frameRate: 6 } as const;
    const story = { id: 1, kind: 'coffee-tasting', story: 'order-mixup', storyStep: 2, startedAt: 0, participantIds: [mara.id], elapsed: 1, duration: 10 } as const;
    const state = calculateGuestVisualState({
      ...base,
      moment: story,
      accident: { id: 1, kind: 'coffee-spill', phase: 'startle', phaseElapsed: 0, phaseDuration: 1, startedAt: 0, position: mara.position, guestId: mara.id },
      reaction: { characterId: mara.id, gesture: 'wave' },
    });
    expect(state).toMatchObject({ expression: 'sorry', gesture: 'swap' });
  });

  it('unterscheidet sitzende Plätze von stehenden Arcade-Automaten samt Blickrichtung', () => {
    const seated = calculateGuestVisualState({ guest: guest(), time: 0, frameRate: 6, activityPose: 'seated', activitySpotKind: 'counter-stool', activityFacing: -1 });
    const standing = calculateGuestVisualState({ guest: guest(), time: 0, frameRate: 6, activityPose: 'standing', activitySpotKind: 'arcade-cabinet', activityFacing: 1 });
    expect(seated).toMatchObject({ seated: true, facing: -1, activitySpotKind: 'counter-stool' });
    expect(standing).toMatchObject({ seated: false, facing: 1, activitySpotKind: 'arcade-cabinet' });
  });
});
