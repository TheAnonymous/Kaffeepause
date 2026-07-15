import type { CafeMomentKind, Point } from '../simulation/types';

export type CinematicShotBeat = 'overview' | 'establishing' | 'detail' | 'reaction' | 'return';
export type CinematicFramingTarget = 'participants' | 'hands-prop' | 'faces' | 'overview';

export interface CameraVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraTransform {
  readonly position: CameraVector3;
  readonly target: CameraVector3;
  readonly fieldOfView: number;
}

export interface CinematicShotDefinition {
  readonly beat: Exclude<CinematicShotBeat, 'overview'>;
  readonly transitionSeconds: number;
  readonly holdSeconds: number;
  readonly framing: CinematicFramingTarget;
  readonly fieldOfView: number;
  readonly safeFrameInset: 0.1;
}

export interface CinematicSequenceProfile {
  readonly id: CinematicSequenceProfileId;
  readonly momentKind?: CafeMomentKind;
  readonly shots: readonly CinematicShotDefinition[];
  readonly minimumOverviewSeconds: 20;
  readonly propAnchor?: Readonly<Point>;
  readonly crescendo: boolean;
}

export type CinematicSequenceProfileId = `moment:${CafeMomentKind}` | 'story' | 'accident' | 'pointer-reaction' | 'conversation';

export interface CinematicTransformSet {
  readonly establishing: CameraTransform;
  readonly detail: CameraTransform;
  readonly reaction: CameraTransform;
}

export interface CinematicSequenceSample {
  readonly phase: 'approach' | 'focus' | 'recover';
  readonly shotBeat: Exclude<CinematicShotBeat, 'overview'>;
  readonly transform: CameraTransform;
  readonly sequenceProgress: number;
  readonly amount: number;
}

interface ProfileSpec {
  readonly anchor: Readonly<Point>;
  readonly fieldOfView: readonly [number, number, number];
  readonly crescendo?: true;
}

const MOMENT_PROFILE_SPECS = {
  'pastry-restock': { anchor: { x: 304, y: 158 }, fieldOfView: [27, 20, 23] },
  'table-reset': { anchor: { x: 166, y: 190 }, fieldOfView: [28, 21, 23] },
  'window-rain-trace': { anchor: { x: 112, y: 150 }, fieldOfView: [27, 20, 22], crescendo: true },
  'pencil-return': { anchor: { x: 168, y: 188 }, fieldOfView: [28, 20, 24] },
  'warm-cup-offer': { anchor: { x: 188, y: 184 }, fieldOfView: [28, 20, 23] },
  'doorway-greeting': { anchor: { x: 24, y: 174 }, fieldOfView: [28, 21, 23] },
  'broth-lid-lift': { anchor: { x: 142, y: 151 }, fieldOfView: [27, 20, 22], crescendo: true },
  'bowl-pass': { anchor: { x: 184, y: 166 }, fieldOfView: [28, 20, 23] },
  'noren-gust': { anchor: { x: 190, y: 138 }, fieldOfView: [28, 22, 24] },
  'condiment-pass': { anchor: { x: 214, y: 172 }, fieldOfView: [28, 20, 24] },
  'last-gyoza-offer': { anchor: { x: 230, y: 174 }, fieldOfView: [28, 20, 24] },
  'napkin-save': { anchor: { x: 258, y: 180 }, fieldOfView: [28, 20, 24] },
  'attract-mode-wave': { anchor: { x: 118, y: 168 }, fieldOfView: [28, 21, 23], crescendo: true },
  'token-hopper-refill': { anchor: { x: 308, y: 152 }, fieldOfView: [27, 20, 23] },
  'cabinet-reboot': { anchor: { x: 92, y: 166 }, fieldOfView: [27, 20, 23] },
  'ticket-trade': { anchor: { x: 244, y: 176 }, fieldOfView: [28, 20, 24] },
  'coop-rescue': { anchor: { x: 134, y: 174 }, fieldOfView: [28, 20, 24] },
  'lounge-prize-share': { anchor: { x: 194, y: 198 }, fieldOfView: [28, 21, 24] },
} as const satisfies Partial<Record<CafeMomentKind, ProfileSpec>>;

export const CINEMATIC_MOMENT_KINDS = Object.freeze(Object.keys(MOMENT_PROFILE_SPECS) as (keyof typeof MOMENT_PROFILE_SPECS)[]);

function createShots(fieldOfView: readonly [number, number, number], crescendo: boolean): readonly CinematicShotDefinition[] {
  return Object.freeze([
    Object.freeze({ beat: 'establishing', transitionSeconds: 2.2, holdSeconds: 2.4, framing: 'participants', fieldOfView: fieldOfView[0], safeFrameInset: 0.1 }),
    Object.freeze({ beat: 'detail', transitionSeconds: 1.4, holdSeconds: crescendo ? 3.4 : 2, framing: 'hands-prop', fieldOfView: fieldOfView[1], safeFrameInset: 0.1 }),
    Object.freeze({ beat: 'reaction', transitionSeconds: 1.4, holdSeconds: crescendo ? 3.8 : 2.4, framing: 'faces', fieldOfView: fieldOfView[2], safeFrameInset: 0.1 }),
    Object.freeze({ beat: 'return', transitionSeconds: 2.8, holdSeconds: 0, framing: 'overview', fieldOfView: 30, safeFrameInset: 0.1 }),
  ]);
}

function momentProfile(kind: keyof typeof MOMENT_PROFILE_SPECS): CinematicSequenceProfile {
  const spec = MOMENT_PROFILE_SPECS[kind];
  const crescendo = 'crescendo' in spec && spec.crescendo === true;
  return Object.freeze({
    id: `moment:${kind}` as const,
    momentKind: kind,
    shots: createShots(spec.fieldOfView, crescendo),
    minimumOverviewSeconds: 20,
    propAnchor: Object.freeze({ ...spec.anchor }),
    crescendo,
  });
}

function genericProfile(id: Exclude<CinematicSequenceProfileId, `moment:${CafeMomentKind}`>): CinematicSequenceProfile {
  return Object.freeze({
    id,
    shots: createShots(id === 'conversation' ? [28, 23, 24] : [28, 21, 23], false),
    minimumOverviewSeconds: 20,
    crescendo: false,
  });
}

const profiles: CinematicSequenceProfile[] = [
  ...CINEMATIC_MOMENT_KINDS.map(momentProfile),
  genericProfile('story'),
  genericProfile('accident'),
  genericProfile('pointer-reaction'),
  genericProfile('conversation'),
];

export const CINEMATIC_SEQUENCE_PROFILES = new Map<CinematicSequenceProfileId, CinematicSequenceProfile>(
  profiles.map((profile) => [profile.id, profile]),
);

export function cinematicSequenceProfile(id: CinematicSequenceProfileId): CinematicSequenceProfile {
  const profile = CINEMATIC_SEQUENCE_PROFILES.get(id);
  if (!profile) throw new Error(`Unbekanntes Kameraprofil: ${id}`);
  return profile;
}

export function cinematicSequenceDuration(profile: CinematicSequenceProfile): number {
  return profile.shots.reduce((sum, shot) => sum + shot.transitionSeconds + shot.holdSeconds, 0);
}

/** Returns a deterministic point inside a shot's hold for visual regression capture. */
export function cinematicShotHoldTime(
  profile: CinematicSequenceProfile,
  beat: 'establishing' | 'detail' | 'reaction',
): number {
  let cursor = 0;
  for (const shot of profile.shots) {
    const transitionEnd = cursor + shot.transitionSeconds;
    if (shot.beat === beat) return transitionEnd + shot.holdSeconds * 0.5;
    cursor = transitionEnd + shot.holdSeconds;
  }
  throw new Error(`Shot ${beat} fehlt in ${profile.id}.`);
}

export function scaleCinematicProfile(profile: CinematicSequenceProfile, scale: number): CinematicSequenceProfile {
  const safeScale = Math.max(0.02, Math.min(1, scale));
  if (safeScale === 1) return profile;
  return {
    ...profile,
    id: profile.id,
    shots: profile.shots.map((shot) => ({
      ...shot,
      transitionSeconds: shot.transitionSeconds * safeScale,
      holdSeconds: shot.holdSeconds * safeScale,
    })),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function cinematicEase(progress: number): number {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export function interpolateCameraTransform(
  from: Readonly<CameraTransform>,
  to: Readonly<CameraTransform>,
  progress: number,
): CameraTransform {
  const amount = cinematicEase(progress);
  return {
    position: {
      x: lerp(from.position.x, to.position.x, amount),
      y: lerp(from.position.y, to.position.y, amount),
      z: lerp(from.position.z, to.position.z, amount),
    },
    target: {
      x: lerp(from.target.x, to.target.x, amount),
      y: lerp(from.target.y, to.target.y, amount),
      z: lerp(from.target.z, to.target.z, amount),
    },
    fieldOfView: lerp(from.fieldOfView, to.fieldOfView, amount),
  };
}

export function sampleCinematicSequence(
  profile: CinematicSequenceProfile,
  elapsed: number,
  origin: Readonly<CameraTransform>,
  overview: Readonly<CameraTransform>,
  transforms: CinematicTransformSet,
): CinematicSequenceSample {
  const total = cinematicSequenceDuration(profile);
  if (elapsed >= total - 0.000001) {
    return { phase: 'recover', shotBeat: 'return', transform: { ...overview }, sequenceProgress: 1, amount: 0 };
  }
  const time = Math.max(0, Math.min(total, elapsed));
  let cursor = 0;
  let previous: Readonly<CameraTransform> = origin;
  for (const shot of profile.shots) {
    const target = shot.beat === 'return' ? overview : transforms[shot.beat];
    const transitionEnd = cursor + shot.transitionSeconds;
    const holdEnd = transitionEnd + shot.holdSeconds;
    if (time < transitionEnd || shot.transitionSeconds === 0) {
      const progress = shot.transitionSeconds === 0 ? 1 : (time - cursor) / shot.transitionSeconds;
      const returnAmount = shot.beat === 'return' ? 1 - cinematicEase(progress) : 1;
      return {
        phase: shot.beat === 'establishing' ? 'approach' : shot.beat === 'return' ? 'recover' : 'focus',
        shotBeat: shot.beat,
        transform: interpolateCameraTransform(previous, target, progress),
        sequenceProgress: total === 0 ? 1 : time / total,
        amount: shot.beat === 'establishing' ? cinematicEase(progress) : returnAmount,
      };
    }
    if (time < holdEnd) {
      return {
        phase: shot.beat === 'return' ? 'recover' : 'focus',
        shotBeat: shot.beat,
        transform: { ...target },
        sequenceProgress: total === 0 ? 1 : time / total,
        amount: shot.beat === 'return' ? 0 : 1,
      };
    }
    cursor = holdEnd;
    previous = target;
  }
  return { phase: 'recover', shotBeat: 'return', transform: { ...overview }, sequenceProgress: 1, amount: 0 };
}
