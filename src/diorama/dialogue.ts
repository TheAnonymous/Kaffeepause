import type { SceneSnapshot } from '../scene/types';
import type { Guest } from '../simulation/types';
import type { VenueKind } from '../venue';

export type DialogueKind = 'conversation' | 'order' | 'moment';

export interface DialogueLine {
  readonly speakerId: string | 'barista';
  readonly romanized: string;
  readonly kind: DialogueKind;
  readonly reveal: number;
  readonly opacity: number;
  readonly scale: number;
  readonly bob: number;
}

const CADENCE = 4.6;
const LEXICONS: Readonly<Record<VenueKind, readonly string[]>> = {
  cafe: ['melo', 'savi', 'noro', 'telu', 'vani', 'kefi', 'luma', 'rilo', 'pava', 'seno'],
  ramen: ['yura', 'koro', 'nami', 'toma', 'raku', 'hanu', 'seki', 'mori', 'zuna', 'poko'],
  arcade: ['zippi', 'nova', 'bexa', 'trixa', 'voki', 'piko', 'dexa', 'qubi', 'zumi', 'biri'],
};

const ENDINGS: Readonly<Record<DialogueKind, readonly string[]>> = {
  conversation: ['?', '…', '!'],
  order: ['!', '?'],
  moment: ['!', '!!', '…'],
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

export function dialogueHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function pseudoPhrase(seed: string, venue: VenueKind, cycle: number, kind: DialogueKind): string {
  const lexicon = LEXICONS[venue];
  const hash = dialogueHash(`${seed}:${cycle}:${venue}:${kind}`);
  const wordCount = kind === 'order' ? 2 + (hash % 2) : 2 + (hash % 3);
  const words: string[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    const word = lexicon[(hash + index * 7 + cycle * 3) % lexicon.length] ?? 'melo';
    words.push(index === 0 ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}` : word);
  }
  const endings = ENDINGS[kind];
  return `${words.join(' ')}${endings[(hash >>> 5) % endings.length] ?? '.'}`;
}

export function dialogueAnimation(phrase: string, elapsed: number, reducedMotion = false): Omit<DialogueLine, 'speakerId' | 'romanized' | 'kind'> {
  if (reducedMotion) return { reveal: phrase.length, opacity: 1, scale: 1, bob: 0 };
  const phase = ((elapsed % CADENCE) + CADENCE) % CADENCE;
  const entering = smoothstep(0.22, 0.5, phase);
  const leaving = 1 - smoothstep(3.65, 4.18, phase);
  const opacity = entering * leaving;
  const reveal = Math.min(phrase.length, Math.max(0, Math.floor((phase - 0.42) * 21)));
  const overshoot = Math.sin(clamp((phase - 0.18) / 0.58) * Math.PI) * 0.09;
  return {
    reveal,
    opacity,
    scale: 0.82 + entering * 0.18 + overshoot,
    bob: Math.sin(elapsed * 2.15) * 0.035,
  };
}

function withAnimation(
  speakerId: string | 'barista',
  venue: VenueKind,
  kind: DialogueKind,
  elapsed: number,
  reducedMotion: boolean,
  salt = '',
): DialogueLine {
  const cycle = Math.floor(elapsed / CADENCE);
  const romanized = pseudoPhrase(`${speakerId}:${salt}`, venue, cycle, kind);
  return { speakerId, romanized, kind, ...dialogueAnimation(romanized, elapsed, reducedMotion) };
}

function closestPair(talkers: readonly Guest[]): readonly Guest[] {
  if (talkers.length < 2) return talkers;
  let best: readonly Guest[] = [talkers[0] as Guest, talkers[1] as Guest];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let left = 0; left < talkers.length; left += 1) {
    for (let right = left + 1; right < talkers.length; right += 1) {
      const a = talkers[left];
      const b = talkers[right];
      if (!a || !b) continue;
      const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      if (distance < bestDistance) {
        best = [a, b];
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Selects at most two speakers, alternates turns and never emits a wall of bubbles. */
export function calculateDialogue(
  snapshot: SceneSnapshot,
  elapsed: number,
  venue: VenueKind,
  reducedMotion = false,
): readonly DialogueLine[] {
  const lines: DialogueLine[] = [];
  const cycle = Math.floor(elapsed / CADENCE);
  const moment = snapshot.moment;
  if (moment && moment.participantIds.length > 0) {
    const speakerId = moment.participantIds[cycle % moment.participantIds.length];
    if (speakerId) lines.push(withAnimation(speakerId, venue, 'moment', elapsed, reducedMotion, moment.kind));
  }

  const ordering = snapshot.guests.find((guest) => guest.state === 'ordering');
  if (ordering && lines.length < 2) {
    const speakerId = cycle % 2 === 0 ? ordering.id : 'barista';
    lines.push(withAnimation(speakerId, venue, 'order', elapsed + 0.64, reducedMotion, ordering.id));
  }

  if (lines.length < 2) {
    const talkers = snapshot.guests.filter((guest) => (
      guest.state === 'activity' && (guest.activity === 'talking' || guest.activity === 'phone')
    ));
    const pair = closestPair(talkers);
    const speaker = pair[cycle % Math.max(1, pair.length)];
    if (speaker && !lines.some((line) => line.speakerId === speaker.id)) {
      lines.push(withAnimation(speaker.id, venue, 'conversation', elapsed + 1.17, reducedMotion, speaker.seatId));
    }
  }
  return lines.filter((line) => line.opacity > 0.01 && line.reveal > 0);
}

