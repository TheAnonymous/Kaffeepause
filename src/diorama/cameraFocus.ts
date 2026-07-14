import type { Point } from '../simulation/types';

export type CameraFocusSource = 'story' | 'accident' | 'reaction' | 'moment' | 'conversation';

export interface CameraFocusCandidate {
  readonly source: CameraFocusSource;
  readonly key: string;
  readonly target: Readonly<Point>;
  readonly participantIds: readonly string[];
  readonly targetHeight: number;
  readonly fieldOfView: number;
}

export interface CameraFocusState {
  readonly active: boolean;
  readonly source?: CameraFocusSource;
  readonly key?: string;
  readonly target?: Readonly<Point>;
  readonly participantIds: readonly string[];
  readonly targetHeight?: number;
  readonly amount: number;
  readonly fieldOfView: number;
}

const PRIORITY: Readonly<Record<CameraFocusSource, number>> = {
  story: 5,
  accident: 4,
  reaction: 3,
  moment: 2,
  conversation: 1,
};

const DURATION: Readonly<Record<CameraFocusSource, number>> = {
  story: 8,
  accident: 8,
  reaction: 3.2,
  moment: 6,
  conversation: 4.2,
};

export const CAMERA_FOCUS_ENTER_SECONDS = 0.9;
export const CAMERA_FOCUS_EXIT_SECONDS = 1.2;
export const CAMERA_CONVERSATION_COOLDOWN_SECONDS = 18;
export const CAMERA_OVERVIEW_FOV = 30;
export const CAMERA_SINGLE_FOCUS_FOV = 22;
export const CAMERA_GROUP_FOCUS_FOV = 24;

interface ActiveFocus extends CameraFocusCandidate {
  readonly startedAt: number;
  readonly exitAt: number;
  readonly endsAt: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function cameraFocusEase(progress: number): number {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
}

export function participantMidpoint(values: readonly Readonly<Point>[]): Point | undefined {
  if (values.length === 0) return undefined;
  return {
    x: values.reduce((sum, value) => sum + value.x, 0) / values.length,
    y: values.reduce((sum, value) => sum + value.y, 0) / values.length,
  };
}

/** Keeps solo scenes intimate while opening wider for larger or more spread-out groups. */
export function focusFieldOfView(values: readonly Readonly<Point>[]): number {
  if (values.length <= 1) return CAMERA_SINGLE_FOCUS_FOV;
  const center = participantMidpoint(values);
  if (!center) return CAMERA_SINGLE_FOCUS_FOV;
  const spread = Math.max(...values.map((value) => Math.hypot(value.x - center.x, value.y - center.y)));
  const groupLift = Math.min(2, (values.length - 1) * 0.6);
  const spreadLift = Math.min(2, spread / 28);
  return Math.min(CAMERA_GROUP_FOCUS_FOV, CAMERA_SINGLE_FOCUS_FOV + Math.max(groupLift, spreadLift));
}

export class CameraFocusDirector {
  private current?: ActiveFocus;
  private readonly completedKeys = new Set<string>();
  private lastConversationFocusAt = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.current = undefined;
  }

  update(now: number, candidates: readonly CameraFocusCandidate[], reducedMotion = false): CameraFocusState {
    if (reducedMotion) {
      this.reset();
      return { active: false, participantIds: [], amount: 0, fieldOfView: CAMERA_OVERVIEW_FOV };
    }

    if (this.current && now >= this.current.endsAt) {
      this.completedKeys.add(`${this.current.source}:${this.current.key}`);
      this.current = undefined;
    }

    const eligible = candidates
      .filter((candidate) => this.canStart(candidate, now))
      .sort((left, right) => PRIORITY[right.source] - PRIORITY[left.source]);
    const next = eligible[0];
    const shouldStart = next && (!this.current || PRIORITY[next.source] > PRIORITY[this.current.source]);
    if (shouldStart) this.start(next, now);

    const current = this.current;
    if (!current) return { active: false, participantIds: [], amount: 0, fieldOfView: CAMERA_OVERVIEW_FOV };
    const amount = now < current.exitAt
      ? cameraFocusEase((now - current.startedAt) / CAMERA_FOCUS_ENTER_SECONDS)
      : 1 - cameraFocusEase((now - current.exitAt) / CAMERA_FOCUS_EXIT_SECONDS);
    return {
      active: true,
      source: current.source,
      key: current.key,
      target: current.target,
      participantIds: current.participantIds,
      targetHeight: current.targetHeight,
      amount,
      fieldOfView: CAMERA_OVERVIEW_FOV - (CAMERA_OVERVIEW_FOV - current.fieldOfView) * amount,
    };
  }

  private canStart(candidate: CameraFocusCandidate, now: number): boolean {
    if (this.current?.source === candidate.source && this.current.key === candidate.key) return false;
    if (candidate.source === 'conversation') return now - this.lastConversationFocusAt >= CAMERA_CONVERSATION_COOLDOWN_SECONDS;
    return !this.completedKeys.has(`${candidate.source}:${candidate.key}`);
  }

  private start(candidate: CameraFocusCandidate, now: number): void {
    if (this.current) this.completedKeys.add(`${this.current.source}:${this.current.key}`);
    const duration = DURATION[candidate.source];
    this.current = {
      ...candidate,
      startedAt: now,
      exitAt: now + Math.max(CAMERA_FOCUS_ENTER_SECONDS, duration - CAMERA_FOCUS_EXIT_SECONDS),
      endsAt: now + duration,
    };
    if (candidate.source === 'conversation') this.lastConversationFocusAt = now;
  }
}
