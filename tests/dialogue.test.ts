import { describe, expect, it } from 'vitest';
import {
  EMOTE_SEQUENCE_INTERVAL_SECONDS,
  calculateDialogue,
  dialogueAnimation,
} from '../src/diorama/dialogue';
import { resolveBubblePlacements } from '../src/diorama/bubbleLayout';
import { emotesForDialogue } from '../src/diorama/emotes';
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
    venue: 'cafe',
    guests,
    barista: { position: { x: 316, y: 142 }, target: { x: 316, y: 142 }, task: 'serving', taskTime: 0, taskDuration: 4, animation: 0, facing: -1 },
    regularIds: [],
    storyStages: {
      sketchbook: 0, 'first-date': 0, 'knit-gift': 0, 'arcade-rivals': 0,
      'order-mixup': 0, 'noodle-mishap': 0, 'glitched-coop': 0,
    },
    navigation: {
      movingGuests: 0, yieldingGuests: 0, blockedGuests: 0, replans: 0, recoveries: 0,
      deadlocks: 0, maxBlockedSeconds: 0, minimumGuestDistance: 0, staticClear: true,
    },
    livingDirection: { activeRoutes: [], completedSequences: 0, goldenSequence: 'cafe-window-to-pastry' },
  };
}

describe('symbolische Emote-Sprache', () => {
  it('verwendet feste, venueabhängige Bedeutungsfolgen', () => {
    expect(emotesForDialogue('order', 'cafe', 'guest-1')).toEqual(['order', 'drink']);
    expect(emotesForDialogue('order', 'ramen', 'guest-1')).toEqual(['order', 'noodle', 'steam']);
    expect(emotesForDialogue('order', 'arcade', 'guest-1')).toEqual(['order', 'game', 'spark']);
  });

  it('zeigt alle 0,85 Sekunden genau ein Symbol und respektiert Reduced Motion', () => {
    const emotes = ['conversation', 'heart', 'spark'] as const;
    expect(EMOTE_SEQUENCE_INTERVAL_SECONDS).toBe(0.85);
    expect(dialogueAnimation(emotes, 0.4)).toMatchObject({ visibleEmotes: ['conversation'], sequenceIndex: 0 });
    expect(dialogueAnimation(emotes, 0.9)).toMatchObject({ visibleEmotes: ['heart'], sequenceIndex: 1 });
    expect(dialogueAnimation(emotes, 1.75)).toMatchObject({ visibleEmotes: ['spark'], sequenceIndex: 2 });
    expect(dialogueAnimation(emotes, 1.1, true)).toMatchObject({
      visibleEmotes: emotes, sequenceIndex: 0, staticSequence: true, opacity: 1, scale: 1, bob: 0,
    });
  });

  it('versetzt kollidierende Blasen und blendet bei Restkollision die niedrigere Priorität aus', () => {
    const separated = resolveBubblePlacements([
      { speakerId: 'reaction', kind: 'reaction', x: 100, y: 100, width: 80, height: 50 },
      { speakerId: 'moment', kind: 'moment', x: 155, y: 100, width: 80, height: 50 },
    ]);
    expect(separated[0]).toMatchObject({ visible: true, offsetX: -17.6 });
    expect(separated[1]).toMatchObject({ visible: true, offsetX: 17.6 });

    const unresolved = resolveBubblePlacements([
      { speakerId: 'conversation', kind: 'conversation', x: 100, y: 100, width: 80, height: 50 },
      { speakerId: 'reaction', kind: 'reaction', x: 100, y: 100, width: 80, height: 50 },
    ]);
    expect(unresolved.find((entry) => entry.speakerId === 'conversation')?.visible).toBe(false);
    expect(unresolved.find((entry) => entry.speakerId === 'reaction')?.visible).toBe(true);
  });

  it('ordnet allen drei Schritten einer neuen Geschichte feste Emotes zu', () => {
    const snapshot = scene([guest({ state: 'activity' })]);
    const steps = [1, 2, 3] as const;
    const sequences = steps.map((storyStep) => emotesForDialogue('moment', 'cafe', 'guest-1', {
      id: storyStep, kind: 'coffee-tasting', story: 'order-mixup', storyStep,
      startedAt: 0, participantIds: ['guest-1'], elapsed: 1, duration: 10,
    }));
    expect(new Set(sequences.map((sequence) => sequence.join(','))).size).toBe(3);
    void snapshot;
  });
});

describe('Gesprächsregie', () => {
  it('wechselt eine Bestellung zwischen Gast und Barista ohne Blasenstapel', () => {
    const snapshot = scene([guest()]);
    const guestTurn = calculateDialogue(snapshot, 0.8, 'cafe');
    const baristaTurn = calculateDialogue(snapshot, 5, 'cafe');
    expect(guestTurn).toHaveLength(1);
    expect(guestTurn[0]?.speakerId).toBe('guest-1');
    expect(guestTurn[0]?.emotes).toEqual(['order', 'drink']);
    expect(baristaTurn).toHaveLength(1);
    expect(baristaTurn[0]?.speakerId).toBe('barista');
    expect(baristaTurn[0]?.kind).toBe('order');
  });

  it('zeigt auch in einem besonderen Moment höchstens zwei Blasen', () => {
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
