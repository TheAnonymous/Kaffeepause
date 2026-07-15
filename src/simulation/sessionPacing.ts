import { SeededRandom } from './random';
import type { MomentCategory, MomentDefinition } from './momentRegistry';
import type { CafeMomentKind } from './types';
import type { VenueKind } from '../venue';

export type SessionAct = 'arrival' | 'settle' | 'crescendo' | 'afterglow';

export interface SessionPacingState {
  readonly act: SessionAct;
  readonly nextCategory: MomentCategory;
  readonly completedInAct: number;
  readonly usedKinds: readonly CafeMomentKind[];
}

export function sessionActAt(elapsedSeconds: number): SessionAct {
  if (elapsedSeconds < 120) return 'arrival';
  if (elapsedSeconds < 420) return 'settle';
  if (elapsedSeconds < 720) return 'crescendo';
  return 'afterglow';
}

export function sessionDelayRange(act: SessionAct): readonly [number, number] {
  if (act === 'arrival') return [75, 115];
  if (act === 'settle') return [55, 85];
  if (act === 'crescendo') return [52, 78];
  return [70, 110];
}

/** Session-local deterministic pacing; no wall clock or renderer state enters the sequence. */
export class SessionPacingDirector {
  private readonly random: SeededRandom;
  private readonly usedByVenue: Record<VenueKind, Set<CafeMomentKind>> = {
    cafe: new Set(), ramen: new Set(), arcade: new Set(),
  };
  private currentAct: SessionAct = 'arrival';
  private nextCategory: MomentCategory = 'ritual';
  private completedInAct = 0;

  constructor(seed = 0x5e55_2026) {
    this.random = new SeededRandom(seed);
  }

  state(elapsedSeconds: number, venue: VenueKind): SessionPacingState {
    this.syncAct(elapsedSeconds);
    return {
      act: this.currentAct,
      nextCategory: this.nextCategory,
      completedInAct: this.completedInAct,
      usedKinds: [...this.usedByVenue[venue]],
    };
  }

  nextDelay(elapsedSeconds: number): number {
    this.syncAct(elapsedSeconds);
    if (this.currentAct === 'arrival' && this.completedInAct > 0) return Math.max(1, 120 - elapsedSeconds);
    const [minimum, maximum] = sessionDelayRange(this.currentAct);
    return this.random.range(minimum, maximum);
  }

  choose(elapsedSeconds: number, venue: VenueKind, eligible: readonly MomentDefinition[]): MomentDefinition | undefined {
    this.syncAct(elapsedSeconds);
    if (this.currentAct === 'arrival' && this.completedInAct > 0) return undefined;
    const venuePool = eligible.filter((entry) => entry.venue === venue);
    if (venuePool.length === 0) return undefined;
    const used = this.usedByVenue[venue];
    if (venuePool.every((entry) => used.has(entry.kind))) used.clear();
    const unused = venuePool.filter((entry) => !used.has(entry.kind));
    let candidates = unused;
    if (this.currentAct === 'arrival') candidates = candidates.filter((entry) => entry.category === 'ritual');
    else if (this.currentAct === 'crescendo') {
      const crescendo = candidates.filter((entry) => entry.crescendo);
      if (crescendo.length > 0) candidates = crescendo;
      else {
        const alternating = candidates.filter((entry) => entry.category === this.nextCategory);
        if (alternating.length > 0) candidates = alternating;
      }
    } else {
      const alternating = candidates.filter((entry) => entry.category === this.nextCategory);
      if (alternating.length > 0) candidates = alternating;
    }
    if (candidates.length === 0) candidates = unused;
    const selected = this.random.pick(candidates);
    if (!selected) return undefined;
    used.add(selected.kind);
    return selected;
  }

  completed(elapsedSeconds: number, category: MomentCategory): void {
    this.syncAct(elapsedSeconds);
    this.completedInAct += 1;
    this.nextCategory = category === 'ritual' ? 'encounter' : 'ritual';
  }

  resetVenue(venue: VenueKind): void {
    this.usedByVenue[venue].clear();
  }

  private syncAct(elapsedSeconds: number): void {
    const next = sessionActAt(elapsedSeconds);
    if (next === this.currentAct) return;
    this.currentAct = next;
    this.completedInAct = 0;
    if (next === 'arrival') this.nextCategory = 'ritual';
  }
}
