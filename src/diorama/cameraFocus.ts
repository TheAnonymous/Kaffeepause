import type { Point } from '../simulation/types';
import type { FocusFrameBounds } from './visualProfiles';
import {
  cinematicEase,
  cinematicShotHoldTime,
  cinematicSequenceDuration,
  cinematicSequenceProfile,
  sampleCinematicSequence,
  type CameraTransform,
  type CameraVector3,
  type CinematicSequenceProfile,
  type CinematicShotBeat,
  type CinematicTransformSet,
} from './cinematicSequence';

export type CameraFocusSource = 'story' | 'accident' | 'reaction' | 'moment' | 'conversation';
export type CameraPhase = 'overview' | 'approach' | 'focus' | 'recover';

export interface CameraRigOutput {
  readonly phase: CameraPhase;
  readonly amount: number;
  readonly fieldOfView: number;
  readonly target?: Readonly<Point>;
  readonly targetHeight?: number;
  readonly shotBeat: CinematicShotBeat;
  readonly sequenceId: string;
  readonly sequenceProgress: number;
  readonly position: CameraVector3;
  readonly lookAt: CameraVector3;
}

export interface CameraFocusCandidate {
  readonly source: CameraFocusSource;
  readonly key: string;
  readonly target: Readonly<Point>;
  readonly participantIds: readonly string[];
  readonly targetHeight: number;
  readonly fieldOfView: number;
  readonly sequenceProfile?: CinematicSequenceProfile;
  readonly transforms?: CinematicTransformSet;
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

const GENERIC_PROFILE: Readonly<Record<Exclude<CameraFocusSource, 'moment'>, ReturnType<typeof cinematicSequenceProfile>>> = {
  story: cinematicSequenceProfile('story'),
  accident: cinematicSequenceProfile('accident'),
  reaction: cinematicSequenceProfile('pointer-reaction'),
  conversation: cinematicSequenceProfile('conversation'),
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
  readonly endsAt: number;
  readonly profile: CinematicSequenceProfile;
  readonly approachOrigin: CameraTransform;
  readonly overviewTransform: CameraTransform;
  readonly cinematicTransforms: CinematicTransformSet;
}

const DEFAULT_OVERVIEW: CameraTransform = Object.freeze({
  position: Object.freeze({ x: 0, y: 6.7, z: 15.8 }),
  target: Object.freeze({ x: 0, y: 2.55, z: -0.2 }),
  fieldOfView: CAMERA_OVERVIEW_FOV,
});

export function cameraFocusEase(progress: number): number {
  return cinematicEase(progress);
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

function transformFromOutput(output: CameraRigOutput): CameraTransform {
  return { position: output.position, target: output.lookAt, fieldOfView: output.fieldOfView };
}

function defaultTransforms(candidate: CameraFocusCandidate, profile: CinematicSequenceProfile): CinematicTransformSet {
  const shots = profile.shots;
  const establishingFov = shots.find((shot) => shot.beat === 'establishing')?.fieldOfView ?? candidate.fieldOfView;
  const detailFov = shots.find((shot) => shot.beat === 'detail')?.fieldOfView ?? candidate.fieldOfView;
  const reactionFov = shots.find((shot) => shot.beat === 'reaction')?.fieldOfView ?? candidate.fieldOfView;
  const centerX = candidate.target.x;
  const centerZ = candidate.target.y;
  return {
    establishing: {
      position: { x: centerX, y: 6.05, z: 13.7 },
      target: { x: centerX, y: candidate.targetHeight, z: centerZ },
      fieldOfView: establishingFov,
    },
    detail: {
      position: { x: centerX, y: 4.85, z: 10.9 },
      target: { x: centerX, y: candidate.targetHeight * 0.58, z: centerZ },
      fieldOfView: detailFov,
    },
    reaction: {
      position: { x: centerX, y: 5.3, z: 11.7 },
      target: { x: centerX, y: candidate.targetHeight, z: centerZ },
      fieldOfView: reactionFov,
    },
  };
}

function overviewState(transform: Readonly<CameraTransform>): CameraFocusState {
  return {
    active: false,
    phase: 'overview',
    participantIds: [],
    amount: 0,
    fieldOfView: transform.fieldOfView,
    shotBeat: 'overview',
    sequenceId: 'none',
    sequenceProgress: 0,
    position: transform.position,
    lookAt: transform.target,
  };
}

export class CameraFocusDirector {
  private current?: ActiveFocus;
  private readonly completedKeys = new Set<string>();
  private lastConversationFocusAt = Number.NEGATIVE_INFINITY;
  private lastRecoveredAt = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.current = undefined;
  }

  update(
    now: number,
    candidates: readonly CameraFocusCandidate[],
    reducedMotion = false,
    overviewTransform: Readonly<CameraTransform> = DEFAULT_OVERVIEW,
    shotOverride?: 'establishing' | 'detail' | 'reaction',
  ): CameraFocusState {
    if (reducedMotion) {
      this.reset();
      return overviewState(overviewTransform);
    }

    if (!shotOverride && this.current && now >= this.current.endsAt - 0.000001) {
      this.completedKeys.add(`${this.current.source}:${this.current.key}`);
      this.current = undefined;
      this.lastRecoveredAt = now;
    }

    if (this.current) {
      const refreshed = candidates.find((candidate) => (
        candidate.source === this.current?.source && candidate.key === this.current.key
      ));
      if (refreshed) {
        this.current = {
          ...this.current,
          target: refreshed.target,
          participantIds: refreshed.participantIds,
          targetHeight: refreshed.targetHeight,
          cinematicTransforms: refreshed.transforms ?? defaultTransforms(refreshed, this.current.profile),
        };
      }
      const currentPriority = PRIORITY[this.current.source];
      const higherPriority = candidates
        .filter((candidate) => PRIORITY[candidate.source] > currentPriority && this.canStart(candidate, now))
        .sort((left, right) => PRIORITY[right.source] - PRIORITY[left.source])[0];
      if (higherPriority) {
        const origin = this.stateFor(this.current, now, shotOverride);
        const savedOverview = this.current.overviewTransform;
        this.completedKeys.add(`${this.current.source}:${this.current.key}`);
        this.start(higherPriority, now, transformFromOutput(origin), savedOverview);
      }
    }

    if (!this.current && now - this.lastRecoveredAt >= CAMERA_MINIMUM_OVERVIEW_SECONDS) {
      const eligible = candidates
        .filter((candidate) => this.canStart(candidate, now))
        .sort((left, right) => PRIORITY[right.source] - PRIORITY[left.source]);
      const next = eligible[0];
      if (next) this.start(next, now, overviewTransform, overviewTransform);
    }

    const current = this.current;
    if (!current) return overviewState(overviewTransform);
    return this.stateFor(current, now, shotOverride);
  }

  private stateFor(
    current: ActiveFocus,
    now: number,
    shotOverride?: 'establishing' | 'detail' | 'reaction',
  ): CameraFocusState {
    const sample = sampleCinematicSequence(
      current.profile,
      shotOverride ? cinematicShotHoldTime(current.profile, shotOverride) : now - current.startedAt,
      current.approachOrigin,
      current.overviewTransform,
      current.cinematicTransforms,
    );
    return {
      active: true,
      phase: sample.phase,
      source: current.source,
      key: current.key,
      target: current.target,
      participantIds: current.participantIds,
      targetHeight: sample.transform.target.y,
      amount: sample.amount,
      fieldOfView: sample.transform.fieldOfView,
      shotBeat: sample.shotBeat,
      sequenceId: current.profile.id,
      sequenceProgress: sample.sequenceProgress,
      position: sample.transform.position,
      lookAt: sample.transform.target,
    };
  }

  private canStart(candidate: CameraFocusCandidate, now: number): boolean {
    if (this.current?.source === candidate.source && this.current.key === candidate.key) return false;
    if (candidate.source === 'conversation') return now - this.lastConversationFocusAt >= CAMERA_CONVERSATION_COOLDOWN_SECONDS;
    return !this.completedKeys.has(`${candidate.source}:${candidate.key}`);
  }

  private start(
    candidate: CameraFocusCandidate,
    now: number,
    approachOrigin: Readonly<CameraTransform>,
    overviewTransform: Readonly<CameraTransform>,
  ): void {
    const profile = candidate.sequenceProfile
      ?? (candidate.source === 'moment' ? cinematicSequenceProfile('conversation') : GENERIC_PROFILE[candidate.source]);
    this.current = {
      ...candidate,
      startedAt: now,
      endsAt: now + cinematicSequenceDuration(profile),
      profile,
      approachOrigin: { ...approachOrigin },
      overviewTransform: { ...overviewTransform },
      cinematicTransforms: candidate.transforms ?? defaultTransforms(candidate, profile),
    };
    if (candidate.source === 'conversation') this.lastConversationFocusAt = now;
  }
}
