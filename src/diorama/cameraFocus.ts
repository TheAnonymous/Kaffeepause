import type { Point } from '../simulation/types';
import type { FocusFrameBounds } from './visualProfiles';

export type CameraFocusSource = 'story' | 'accident' | 'reaction' | 'moment' | 'conversation';
export type CameraPhase = 'overview' | 'approach' | 'focus' | 'recover';

export interface CameraRigOutput {
  readonly phase: CameraPhase;
  readonly amount: number;
  readonly fieldOfView: number;
  readonly target?: Readonly<Point>;
  readonly targetHeight?: number;
}

export interface CameraFocusCandidate {
  readonly source: CameraFocusSource;
  readonly key: string;
  readonly target: Readonly<Point>;
  readonly participantIds: readonly string[];
  readonly targetHeight: number;
  readonly fieldOfView: number;
}

export interface CameraFocusState extends CameraRigOutput {
  readonly active: boolean;
  readonly source?: CameraFocusSource;
  readonly key?: string;
  readonly participantIds: readonly string[];
}

const PRIORITY: Readonly<Record<CameraFocusSource, number>> = {
  story: 5,
  accident: 4,
  reaction: 3,
  moment: 2,
  conversation: 1,
};

const FOCUS_HOLD_SECONDS: Readonly<Record<CameraFocusSource, number>> = {
  story: 8,
  accident: 8,
  reaction: 3.2,
  moment: 6,
  conversation: 4.2,
};

export const CAMERA_APPROACH_SECONDS = 2.2;
export const CAMERA_RECOVER_SECONDS = 2.8;
export const CAMERA_MINIMUM_OVERVIEW_SECONDS = 20;
export const CAMERA_CONVERSATION_COOLDOWN_SECONDS = 20;
export const CAMERA_OVERVIEW_FOV = 30;
export const CAMERA_SINGLE_FOCUS_FOV = 22;
export const CAMERA_GROUP_FOCUS_FOV = 26;

export interface FocusFrameElement {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly role: 'participant' | 'hands-prop' | 'speech-bubble';
}

interface ActiveFocus extends CameraFocusCandidate {
  readonly startedAt: number;
  readonly approachEndsAt: number;
  readonly focusEndsAt: number;
  readonly endsAt: number;
  readonly approachOrigin: CameraRigOutput;
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

/** Combines projected people, gesture/prop extents and speech bubbles into one normalized viewport frame. */
export function calculateFocusFrameBounds(elements: readonly Readonly<FocusFrameElement>[]): FocusFrameBounds | undefined {
  if (elements.length === 0) return undefined;
  const left = Math.min(...elements.map((element) => element.left));
  const top = Math.min(...elements.map((element) => element.top));
  const right = Math.max(...elements.map((element) => element.right));
  const bottom = Math.max(...elements.map((element) => element.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Keeps solo scenes intimate while opening wider for larger or more spread-out groups. */
export function focusFieldOfView(values: readonly Readonly<Point>[]): number {
  if (values.length <= 1) return CAMERA_SINGLE_FOCUS_FOV;
  const center = participantMidpoint(values);
  if (!center) return CAMERA_SINGLE_FOCUS_FOV;
  const spread = Math.max(...values.map((value) => Math.hypot(value.x - center.x, value.y - center.y)));
  const groupLift = Math.min(4, (values.length - 1) * 0.75);
  const spreadLift = Math.min(4, spread / 22);
  return Math.min(CAMERA_GROUP_FOCUS_FOV, CAMERA_SINGLE_FOCUS_FOV + Math.max(groupLift, spreadLift));
}

export class CameraFocusDirector {
  private current?: ActiveFocus;
  private readonly completedKeys = new Set<string>();
  private lastConversationFocusAt = Number.NEGATIVE_INFINITY;
  private lastRecoveredAt = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.current = undefined;
  }

  update(now: number, candidates: readonly CameraFocusCandidate[], reducedMotion = false): CameraFocusState {
    if (reducedMotion) {
      this.reset();
      return { active: false, phase: 'overview', participantIds: [], amount: 0, fieldOfView: CAMERA_OVERVIEW_FOV };
    }

    if (this.current && now >= this.current.endsAt) {
      this.completedKeys.add(`${this.current.source}:${this.current.key}`);
      this.current = undefined;
      this.lastRecoveredAt = now;
    }

    if (this.current) {
      const currentPriority = PRIORITY[this.current.source];
      const higherPriority = candidates
        .filter((candidate) => PRIORITY[candidate.source] > currentPriority && this.canStart(candidate, now))
        .sort((left, right) => PRIORITY[right.source] - PRIORITY[left.source])[0];
      if (higherPriority) {
        const origin = this.stateFor(this.current, now);
        this.completedKeys.add(`${this.current.source}:${this.current.key}`);
        this.start(higherPriority, now, origin);
      }
    }

    if (!this.current && now - this.lastRecoveredAt >= CAMERA_MINIMUM_OVERVIEW_SECONDS) {
      const eligible = candidates
        .filter((candidate) => this.canStart(candidate, now))
        .sort((left, right) => PRIORITY[right.source] - PRIORITY[left.source]);
      const next = eligible[0];
      if (next) this.start(next, now);
    }

    const current = this.current;
    if (!current) return { active: false, phase: 'overview', participantIds: [], amount: 0, fieldOfView: CAMERA_OVERVIEW_FOV };
    return this.stateFor(current, now);
  }

  private stateFor(current: ActiveFocus, now: number): CameraFocusState {
    const phase: CameraPhase = now < current.approachEndsAt ? 'approach'
      : now < current.focusEndsAt ? 'focus' : 'recover';
    const approachProgress = cameraFocusEase((now - current.startedAt) / CAMERA_APPROACH_SECONDS);
    const amount = phase === 'approach'
      ? current.approachOrigin.amount + (1 - current.approachOrigin.amount) * approachProgress
      : phase === 'focus'
        ? 1
        : 1 - cameraFocusEase((now - current.focusEndsAt) / CAMERA_RECOVER_SECONDS);
    const target = phase === 'approach' && current.approachOrigin.target
      ? {
          x: current.approachOrigin.target.x + (current.target.x - current.approachOrigin.target.x) * approachProgress,
          y: current.approachOrigin.target.y + (current.target.y - current.approachOrigin.target.y) * approachProgress,
        }
      : current.target;
    const targetHeight = phase === 'approach' && current.approachOrigin.targetHeight !== undefined
      ? current.approachOrigin.targetHeight
        + (current.targetHeight - current.approachOrigin.targetHeight) * approachProgress
      : current.targetHeight;
    const fieldOfView = phase === 'approach'
      ? current.approachOrigin.fieldOfView
        + (current.fieldOfView - current.approachOrigin.fieldOfView) * approachProgress
      : CAMERA_OVERVIEW_FOV - (CAMERA_OVERVIEW_FOV - current.fieldOfView) * amount;
    return {
      active: true,
      phase,
      source: current.source,
      key: current.key,
      target,
      participantIds: current.participantIds,
      targetHeight,
      amount,
      fieldOfView,
    };
  }

  private canStart(candidate: CameraFocusCandidate, now: number): boolean {
    if (this.current?.source === candidate.source && this.current.key === candidate.key) return false;
    if (candidate.source === 'conversation') return now - this.lastConversationFocusAt >= CAMERA_CONVERSATION_COOLDOWN_SECONDS;
    return !this.completedKeys.has(`${candidate.source}:${candidate.key}`);
  }

  private start(candidate: CameraFocusCandidate, now: number, approachOrigin?: CameraRigOutput): void {
    const duration = FOCUS_HOLD_SECONDS[candidate.source];
    this.current = {
      ...candidate,
      startedAt: now,
      approachEndsAt: now + CAMERA_APPROACH_SECONDS,
      focusEndsAt: now + CAMERA_APPROACH_SECONDS + duration,
      endsAt: now + CAMERA_APPROACH_SECONDS + duration + CAMERA_RECOVER_SECONDS,
      approachOrigin: approachOrigin ?? {
        phase: 'overview', amount: 0, fieldOfView: CAMERA_OVERVIEW_FOV, target: candidate.target,
        targetHeight: candidate.targetHeight,
      },
    };
    if (candidate.source === 'conversation') this.lastConversationFocusAt = now;
  }
}
