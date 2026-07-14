import type { SceneSnapshot } from '../scene/types';
import type { Guest } from '../simulation/types';
import type { VenueKind } from '../venue';
import { emotesForDialogue, type EmoteDialogueKind, type EmoteSymbol } from './emotes';
import type { ActivePointerReaction } from './pointerReaction';

export type DialogueKind = EmoteDialogueKind;

export interface DialogueLine {
  readonly speakerId: string | 'barista';
  readonly emotes: readonly EmoteSymbol[];
  readonly kind: DialogueKind;
  readonly reveal: number;
  readonly opacity: number;
  readonly scale: number;
  readonly bob: number;
}

const CADENCE = 4.6;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

export function dialogueAnimation(
  emotes: number | readonly EmoteSymbol[],
  elapsed: number,
  reducedMotion = false,
): Omit<DialogueLine, 'speakerId' | 'emotes' | 'kind'> {
  const count = typeof emotes === 'number' ? emotes : emotes.length;
  if (reducedMotion) return { reveal: count, opacity: 1, scale: 1, bob: 0 };
  const phase = ((elapsed % CADENCE) + CADENCE) % CADENCE;
  const entering = smoothstep(0.18, 0.46, phase);
  const leaving = 1 - smoothstep(3.65, 4.18, phase);
  const opacity = entering * leaving;
  const reveal = Math.min(count, Math.max(0, Math.floor((phase - 0.3) * 5.5)));
  const overshoot = Math.sin(clamp((phase - 0.14) / 0.58) * Math.PI) * 0.09;
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
  kind: Exclude<DialogueKind, 'reaction'>,
  elapsed: number,
  reducedMotion: boolean,
  seed: string,
  snapshot: SceneSnapshot,
): DialogueLine {
  const emotes = emotesForDialogue(kind, venue, seed, kind === 'moment' ? snapshot.moment : undefined);
  return { speakerId, emotes, kind, ...dialogueAnimation(emotes, elapsed, reducedMotion) };
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
  reaction?: Readonly<ActivePointerReaction>,
): readonly DialogueLine[] {
  const lines: DialogueLine[] = [];
  const cycle = Math.floor(elapsed / CADENCE);
  if (reaction) {
    const localElapsed = elapsed - reaction.startedAt + 0.55;
    lines.push({
      speakerId: reaction.characterId,
      emotes: reaction.emotes,
      kind: 'reaction',
      ...dialogueAnimation(reaction.emotes, localElapsed, reducedMotion),
    });
  }

  const moment = snapshot.moment;
  if (moment && moment.participantIds.length > 0 && lines.length < 2) {
    const speakerId = moment.participantIds[cycle % moment.participantIds.length];
    if (speakerId && !lines.some((line) => line.speakerId === speakerId)) {
      lines.push(withAnimation(speakerId, venue, 'moment', elapsed, reducedMotion, moment.kind, snapshot));
    }
  }

  const ordering = snapshot.guests.find((guest) => guest.state === 'ordering');
  if (ordering && lines.length < 2) {
    const speakerId = cycle % 2 === 0 ? ordering.id : 'barista';
    if (!lines.some((line) => line.speakerId === speakerId)) {
      lines.push(withAnimation(speakerId, venue, 'order', elapsed + 0.64, reducedMotion, ordering.id, snapshot));
    }
  }

  if (lines.length < 2) {
    const talkers = snapshot.guests.filter((guest) => (
      guest.state === 'activity' && (guest.activity === 'talking' || guest.activity === 'phone')
    ));
    const pair = closestPair(talkers);
    const speaker = pair[cycle % Math.max(1, pair.length)];
    if (speaker && !lines.some((line) => line.speakerId === speaker.id)) {
      lines.push(withAnimation(speaker.id, venue, 'conversation', elapsed + 1.17, reducedMotion, speaker.seatId ?? speaker.id, snapshot));
    }
  }
  return lines.filter((line) => line.opacity > 0.01 && line.reveal > 0);
}

