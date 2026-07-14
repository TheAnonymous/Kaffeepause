import type { ReactionGesture } from './characterVisualState';
import type { EmoteSymbol } from './emotes';
import { emoteForReaction } from './emotes';
import type { VenueKind } from '../venue';

export const REACTION_ACTIVATION_RADIUS = 72;
export const REACTION_RESET_RADIUS = 96;
export const REACTION_DWELL_SECONDS = 0.3;
export const REACTION_DURATION_SECONDS = 3.2;
export const REACTION_GLOBAL_COOLDOWN_SECONDS = 6;
export const REACTION_CHARACTER_COOLDOWN_SECONDS = 12;

export interface PointerSample {
  readonly x: number;
  readonly y: number;
}

export interface ReactionTarget {
  readonly id: string | 'barista';
  readonly x: number;
  readonly y: number;
}

export interface ActivePointerReaction {
  readonly serial: number;
  readonly characterId: string | 'barista';
  readonly gesture: ReactionGesture;
  readonly emotes: readonly EmoteSymbol[];
  readonly startedAt: number;
  readonly endsAt: number;
  readonly facing: -1 | 1;
}

export interface PointerReactionUpdate {
  readonly active?: ActivePointerReaction;
  readonly started?: ActivePointerReaction;
}

function distance(pointer: PointerSample, target: ReactionTarget): number {
  return Math.hypot(pointer.x - target.x, pointer.y - target.y);
}

function gestureFor(id: string, serial: number): ReactionGesture {
  let hash = serial;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 31);
  return (['wave', 'nod', 'laugh'] as const)[Math.abs(hash) % 3] ?? 'wave';
}

export class PointerReactionController {
  private hoveredId?: string | 'barista';
  private dwellStartedAt = 0;
  private lastGlobalReactionAt = Number.NEGATIVE_INFINITY;
  private readonly characterCooldowns = new Map<string, number>();
  private current?: ActivePointerReaction;
  private serial = 0;

  clearPointer(): void {
    this.hoveredId = undefined;
    this.dwellStartedAt = 0;
  }

  update(
    now: number,
    pointer: PointerSample | undefined,
    targets: readonly ReactionTarget[],
    venue: VenueKind,
  ): PointerReactionUpdate {
    if (this.current && now >= this.current.endsAt) this.current = undefined;
    if (!pointer || targets.length === 0) {
      this.clearPointer();
      return { active: this.current };
    }

    const nearest = [...targets].sort((left, right) => distance(pointer, left) - distance(pointer, right))[0];
    if (!nearest) return { active: this.current };
    const nearestDistance = distance(pointer, nearest);
    const continuing = this.hoveredId === nearest.id;
    const withinRadius = continuing ? nearestDistance <= REACTION_RESET_RADIUS : nearestDistance <= REACTION_ACTIVATION_RADIUS;
    if (!withinRadius) {
      this.clearPointer();
      return { active: this.current };
    }

    if (!continuing) {
      this.hoveredId = nearest.id;
      this.dwellStartedAt = now;
      return { active: this.current };
    }
    if (this.current || now - this.dwellStartedAt < REACTION_DWELL_SECONDS) return { active: this.current };
    if (now - this.lastGlobalReactionAt < REACTION_GLOBAL_COOLDOWN_SECONDS) return {};
    const lastCharacterReaction = this.characterCooldowns.get(nearest.id) ?? Number.NEGATIVE_INFINITY;
    if (now - lastCharacterReaction < REACTION_CHARACTER_COOLDOWN_SECONDS) return {};

    this.serial += 1;
    const gesture = gestureFor(nearest.id, this.serial);
    const reaction: ActivePointerReaction = {
      serial: this.serial,
      characterId: nearest.id,
      gesture,
      emotes: emoteForReaction(venue, gesture),
      startedAt: now,
      endsAt: now + REACTION_DURATION_SECONDS,
      facing: pointer.x < nearest.x ? -1 : 1,
    };
    this.current = reaction;
    this.lastGlobalReactionAt = now;
    this.characterCooldowns.set(nearest.id, now);
    return { active: reaction, started: reaction };
  }
}
