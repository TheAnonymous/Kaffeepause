import type { CafeMoment } from '../simulation/types';
import type { VenueKind } from '../venue';

export const EMOTE_SYMBOLS = [
  'conversation', 'order', 'drink', 'heart', 'spark', 'question', 'surprise', 'apology',
  'steam', 'noodle', 'music', 'game', 'star', 'tool', 'laugh',
] as const;

export type EmoteSymbol = (typeof EMOTE_SYMBOLS)[number];
export type EmoteDialogueKind = 'conversation' | 'order' | 'moment' | 'reaction';

const MOMENT_EMOTES: Readonly<Record<CafeMoment['kind'], readonly EmoteSymbol[]>> = {
  'shared-cake': ['drink', 'heart'],
  'card-game': ['game', 'spark'],
  'window-gaze': ['conversation', 'steam'],
  'sketch-reveal': ['tool', 'spark', 'heart'],
  'first-date-toast': ['drink', 'heart', 'spark'],
  'knit-gift': ['heart', 'spark'],
  'coffee-tasting': ['drink', 'spark'],
  'ramen-slurp': ['noodle', 'steam'],
  'arcade-duel': ['game', 'spark'],
  'arcade-high-score': ['game', 'star', 'laugh'],
  'umbrella-handoff': ['apology', 'heart'],
  'foam-moustache': ['drink', 'surprise', 'laugh'],
  'sugar-packet-domino': ['spark', 'surprise', 'laugh'],
  'steam-glasses': ['steam', 'question', 'laugh'],
  'chopstick-drop': ['surprise', 'apology'],
  'ticket-stream': ['game', 'star', 'surprise'],
  'button-mash-sync': ['game', 'music', 'spark'],
};

const STORY_EMOTES: Readonly<Record<NonNullable<CafeMoment['story']>, readonly (readonly EmoteSymbol[])[]>> = {
  sketchbook: [['tool', 'spark'], ['star', 'heart']],
  'first-date': [['drink', 'question', 'heart'], ['drink', 'heart', 'spark']],
  'knit-gift': [['heart', 'spark']],
  'arcade-rivals': [['game', 'spark'], ['star', 'laugh']],
  'order-mixup': [
    ['order', 'question', 'surprise'],
    ['drink', 'apology', 'question'],
    ['drink', 'heart', 'spark'],
  ],
  'noodle-mishap': [
    ['noodle', 'steam', 'surprise'],
    ['surprise', 'apology', 'steam'],
    ['laugh', 'noodle', 'heart'],
  ],
  'glitched-coop': [
    ['game', 'question', 'spark'],
    ['tool', 'game', 'surprise'],
    ['star', 'laugh', 'heart'],
  ],
};

function seedParity(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value + seed.charCodeAt(index) * (index + 1)) >>> 0;
  return value % 2;
}

export function emotesForDialogue(
  kind: Exclude<EmoteDialogueKind, 'reaction'>,
  venue: VenueKind,
  seed: string,
  moment?: Readonly<CafeMoment>,
): readonly EmoteSymbol[] {
  if (kind === 'moment' && moment) {
    if (moment.story) {
      const sequence = STORY_EMOTES[moment.story][Math.max(0, (moment.storyStep ?? 1) - 1)];
      if (sequence) return sequence;
    }
    return MOMENT_EMOTES[moment.kind];
  }
  if (kind === 'order') {
    if (venue === 'ramen') return ['order', 'noodle', 'steam'];
    if (venue === 'arcade') return ['order', 'game', 'spark'];
    return ['order', 'drink'];
  }
  if (venue === 'ramen') return seedParity(seed) ? ['conversation', 'noodle'] : ['conversation', 'steam'];
  if (venue === 'arcade') return seedParity(seed) ? ['conversation', 'game', 'star'] : ['conversation', 'music'];
  return seedParity(seed) ? ['conversation', 'heart'] : ['conversation', 'drink', 'spark'];
}

export function emoteForReaction(venue: VenueKind, gesture: 'wave' | 'nod' | 'laugh'): readonly EmoteSymbol[] {
  if (gesture === 'laugh') return ['laugh', venue === 'arcade' ? 'star' : 'heart'];
  if (gesture === 'nod') return [venue === 'ramen' ? 'noodle' : venue === 'arcade' ? 'game' : 'drink', 'heart'];
  return ['conversation', venue === 'arcade' ? 'spark' : 'heart'];
}

