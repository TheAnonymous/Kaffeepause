import { describe, expect, it } from 'vitest';
import { calculateDialogue, dialogueAnimation, pseudoPhrase } from '../src/diorama/dialogue';
import type { SceneSnapshot } from '../src/scene/types';
import type { Guest } from '../src/simulation/types';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1', name: 'Melo', state: 'ordering', activity: 'talking',
    position: { x: 280, y: 170 }, target: { x: 280, y: 170 }, facing: 1,
    speed: 1, stateTime: 0, stateDuration: 10, animation: 0, activityRounds: 0,
    palette: { skin: '#c98363', hair: '#251c24', coat: '#53706b', accent: '#e4b973', trousers: '#303847', shoes: '#1c1820' },
    appearance: { body: 'soft', face: 'round', hair: 'bob', outfit: 'cardigan', detail: 'freckles', maturity: 'adult', heightOffset: 0, widthOffset: 0, pattern: 0 },
    ...overrides,
  };
}

function scene(guests: readonly Guest[]): SceneSnapshot {
  return {
    guests,
    barista: { position: { x: 316, y: 142 }, target: { x: 316, y: 142 }, task: 'serving', taskTime: 0, taskDuration: 4, animation: 0, facing: -1 },
    regularIds: [],
    storyStages: { sketchbook: 0, 'first-date': 0, 'knit-gift': 0, 'arcade-rivals': 0 },
  };
}

describe('procedural pseudo-language', () => {
  it('stays deterministic but has a venue-specific vocabulary', () => {
    const cafe = pseudoPhrase('guest-1', 'cafe', 3, 'conversation');
    expect(pseudoPhrase('guest-1', 'cafe', 3, 'conversation')).toBe(cafe);
    expect(pseudoPhrase('guest-1', 'ramen', 3, 'conversation')).not.toBe(cafe);
    expect(cafe.split(' ').length).toBeGreaterThanOrEqual(2);
  });

  it('reveals the line character by character and respects reduced motion', () => {
    const phrase = 'Melo savi?';
    expect(dialogueAnimation(phrase, 0.25).reveal).toBe(0);
    expect(dialogueAnimation(phrase, 1.1).reveal).toBeGreaterThan(0);
    expect(dialogueAnimation(phrase, 1.1).reveal).toBeLessThanOrEqual(phrase.length);
    expect(dialogueAnimation(phrase, 1.1, true)).toMatchObject({ reveal: phrase.length, opacity: 1, scale: 1, bob: 0 });
  });
});

describe('conversation direction', () => {
  it('alternates an order between guest and barista without stacking bubbles', () => {
    const snapshot = scene([guest()]);
    const guestTurn = calculateDialogue(snapshot, 0.8, 'cafe');
    const baristaTurn = calculateDialogue(snapshot, 5, 'cafe');
    expect(guestTurn).toHaveLength(1);
    expect(guestTurn[0]?.speakerId).toBe('guest-1');
    expect(baristaTurn).toHaveLength(1);
    expect(baristaTurn[0]?.speakerId).toBe('barista');
    expect(baristaTurn[0]?.kind).toBe('order');
  });

  it('allows at most two simultaneous bubbles even during a special moment', () => {
    const guests = [
      guest({ id: 'guest-1', state: 'activity', activity: 'talking' }),
      guest({ id: 'guest-2', state: 'activity', activity: 'talking', position: { x: 300, y: 175 } }),
      guest({ id: 'guest-3', state: 'activity', activity: 'phone', position: { x: 100, y: 180 } }),
    ];
    const snapshot: SceneSnapshot = {
      ...scene(guests),
      moment: { id: 1, kind: 'shared-cake', startedAt: 0, participantIds: ['guest-1', 'guest-2'], elapsed: 1, duration: 8 },
    };
    expect(calculateDialogue(snapshot, 1.2, 'cafe').length).toBeLessThanOrEqual(2);
  });
});

