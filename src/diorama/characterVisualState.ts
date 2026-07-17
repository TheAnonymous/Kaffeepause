import type { Barista, CafeAccident, CafeMoment, Guest } from '../simulation/types';
import type { ActivityPose, ActivitySpotKind } from '../simulation/layout';

export const CHARACTER_FRAME_COUNT = 4 as const;

export type CharacterPose =
  | 'walking'
  | 'waiting'
  | 'ordering'
  | Guest['activity']
  | Barista['task'];

export type CharacterExpression = 'neutral' | 'focused' | 'smile' | 'laugh' | 'surprised' | 'sorry';
export type CharacterGesture = 'none' | 'wave' | 'nod' | 'laugh' | 'compare' | 'swap' | 'toast' | 'startle' | 'clean';
export type ReactionGesture = 'wave' | 'nod' | 'laugh';

export interface CharacterReactionVisual {
  readonly characterId: string | 'barista';
  readonly gesture: ReactionGesture;
  readonly facing?: -1 | 1;
}

export interface CharacterVisualState {
  readonly pose: CharacterPose;
  readonly frame: 0 | 1 | 2 | 3;
  readonly facing: -1 | 1;
  readonly expression: CharacterExpression;
  readonly gesture: CharacterGesture;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly seated: boolean;
  readonly activitySpotKind?: ActivitySpotKind;
  readonly momentKind?: CafeMoment['kind'];
}

export interface GuestVisualStateInput {
  readonly guest: Guest;
  readonly moment?: Readonly<CafeMoment>;
  readonly accident?: Readonly<CafeAccident>;
  readonly reaction?: Readonly<CharacterReactionVisual>;
  readonly time: number;
  readonly frameRate: number;
  readonly reducedMotion?: boolean;
  readonly participantCenterX?: number;
  readonly activityPose?: ActivityPose;
  readonly activitySpotKind?: ActivitySpotKind;
  readonly activityFacing?: -1 | 1;
}

export interface BaristaVisualStateInput {
  readonly barista: Barista;
  readonly moment?: Readonly<CafeMoment>;
  readonly accident?: Readonly<CafeAccident>;
  readonly reaction?: Readonly<CharacterReactionVisual>;
  readonly time: number;
  readonly frameRate: number;
  readonly reducedMotion?: boolean;
}

function stablePhase(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  return (hash >>> 0) % CHARACTER_FRAME_COUNT;
}

export function characterFrameAt(
  time: number,
  frameRate: number,
  seed = '',
  reducedMotion = false,
  keyFrame: 0 | 1 | 2 | 3 = 0,
): 0 | 1 | 2 | 3 {
  if (reducedMotion) return keyFrame;
  const tick = Math.max(0, Math.floor(Math.max(0, time) * Math.max(1, frameRate)));
  return ((tick + stablePhase(seed)) % CHARACTER_FRAME_COUNT) as 0 | 1 | 2 | 3;
}

export function poseForGuest(guest: Pick<Guest, 'state' | 'activity'>): CharacterPose {
  if (guest.state === 'entering' || guest.state.includes('walking') || guest.state === 'exiting') {
    return 'walking';
  }
  if (guest.state === 'ordering') return 'ordering';
  if (guest.state === 'activity' || guest.state === 'scene-pause') return guest.activity;
  return 'waiting';
}

function storyGesture(moment: Readonly<CafeMoment>): Pick<CharacterVisualState, 'expression' | 'gesture'> {
  const step = moment.storyStep ?? 1;
  if (moment.story === 'order-mixup') {
    if (step === 1) return { expression: 'surprised', gesture: 'compare' };
    if (step === 2) return { expression: 'sorry', gesture: 'swap' };
    return { expression: 'smile', gesture: 'toast' };
  }
  if (moment.story === 'noodle-mishap') {
    if (step === 1) return { expression: 'focused', gesture: 'compare' };
    if (step === 2) return { expression: 'surprised', gesture: 'startle' };
    return { expression: 'laugh', gesture: 'clean' };
  }
  if (moment.story === 'glitched-coop') {
    if (step === 1) return { expression: 'surprised', gesture: 'compare' };
    if (step === 2) return { expression: 'focused', gesture: 'swap' };
    return { expression: 'laugh', gesture: 'toast' };
  }
  if (moment.kind === 'first-date-toast' || moment.kind === 'shared-cake') return { expression: 'smile', gesture: 'toast' };
  if (moment.kind === 'knit-gift' || moment.kind === 'umbrella-handoff') return { expression: 'smile', gesture: 'swap' };
  return { expression: 'smile', gesture: 'compare' };
}

function momentGesture(moment: Readonly<CafeMoment>): Pick<CharacterVisualState, 'expression' | 'gesture'> {
  if (moment.story) return storyGesture(moment);
  if (moment.kind === 'foam-moustache' || moment.kind === 'steam-glasses' || moment.kind === 'ticket-stream') {
    return { expression: 'laugh', gesture: 'laugh' };
  }
  if (moment.kind === 'sugar-packet-domino' || moment.kind === 'chopstick-drop') {
    return { expression: 'surprised', gesture: 'startle' };
  }
  if (moment.kind === 'button-mash-sync' || moment.kind === 'arcade-high-score') {
    return { expression: 'laugh', gesture: 'toast' };
  }
  if (moment.kind === 'coffee-tasting' || moment.kind === 'first-date-toast') return { expression: 'smile', gesture: 'toast' };
  if (['pencil-return', 'warm-cup-offer', 'bowl-pass', 'condiment-pass', 'last-gyoza-offer',
    'ticket-trade', 'coop-rescue', 'lounge-prize-share'].includes(moment.kind)) {
    return { expression: 'smile', gesture: 'swap' };
  }
  if (['doorway-greeting', 'attract-mode-wave'].includes(moment.kind)) return { expression: 'smile', gesture: 'wave' };
  if (['noren-gust', 'napkin-save', 'cabinet-reboot'].includes(moment.kind)) return { expression: 'surprised', gesture: 'startle' };
  if (['window-rain-trace', 'broth-lid-lift'].includes(moment.kind)) return { expression: 'focused', gesture: 'compare' };
  return { expression: 'smile', gesture: 'compare' };
}

export function calculateGuestVisualState(input: GuestVisualStateInput): CharacterVisualState {
  const { guest, moment, accident, reaction, reducedMotion = false } = input;
  const pose = poseForGuest(guest);
  const keyFrame = pose === 'walking' ? 1 : pose === 'waiting' ? 0 : 2;
  const frame = characterFrameAt(input.time, input.frameRate, `${guest.id}:${pose}`, reducedMotion, keyFrame);
  const participant = Boolean(moment?.participantIds.includes(guest.id));
  const accidentParticipant = accident?.guestId === guest.id || accident?.witnessId === guest.id;
  let facing = guest.state === 'activity' ? input.activityFacing ?? guest.facing : guest.facing;
  let expression: CharacterExpression = pose === 'talking' ? 'smile' : pose === 'typing' ? 'focused' : 'neutral';
  let gesture: CharacterGesture = 'none';
  let offsetX = 0;
  let offsetY = 0;

  if (participant && input.participantCenterX !== undefined && Math.abs(input.participantCenterX - guest.position.x) > 0.2) {
    facing = input.participantCenterX < guest.position.x ? -1 : 1;
  }

  // Stories and accidents own the performance; reactions outrank ordinary moments only.
  if (moment?.story && participant) {
    ({ expression, gesture } = storyGesture(moment));
    offsetX = facing * (frame % 2 === 0 ? 0.035 : 0.015);
  } else if (accident && accidentParticipant) {
    expression = accident.phase === 'cleanup' ? 'focused' : 'surprised';
    gesture = accident.phase === 'cleanup' ? 'clean' : 'startle';
    offsetX = accident.phase === 'chaos' ? facing * (frame % 2 === 0 ? -0.055 : 0.025) : 0;
    offsetY = accident.phase === 'startle' && !reducedMotion ? 0.045 : 0;
  } else if (reaction?.characterId === guest.id) {
    facing = reaction.facing ?? facing;
    expression = reaction.gesture === 'laugh' ? 'laugh' : 'smile';
    gesture = reaction.gesture;
    offsetY = reaction.gesture === 'nod' && !reducedMotion ? (frame === 1 || frame === 2 ? -0.025 : 0) : 0;
  } else if (moment && participant) {
    ({ expression, gesture } = momentGesture(moment));
    offsetX = facing * (frame % 2 === 0 ? 0.025 : 0);
  }

  return {
    pose, frame, facing, expression, gesture, offsetX, offsetY,
    seated: guest.state === 'activity' && input.activityPose !== 'standing',
    activitySpotKind: input.activitySpotKind,
    momentKind: participant ? moment?.kind : undefined,
  };
}

export function calculateBaristaVisualState(input: BaristaVisualStateInput): CharacterVisualState {
  const { barista, moment, accident, reaction, reducedMotion = false } = input;
  const frame = characterFrameAt(input.time, input.frameRate, `barista:${barista.task}`, reducedMotion, barista.task === 'serving' ? 2 : 0);
  let facing = barista.facing;
  let expression: CharacterExpression = barista.task === 'tasting' ? 'smile' : 'focused';
  let gesture: CharacterGesture = 'none';
  let offsetY = 0;

  const momentParticipant = Boolean(moment?.participantIds.includes('barista'));
  if (accident?.kind === 'tray-drop') {
    expression = accident.phase === 'cleanup' ? 'focused' : 'surprised';
    gesture = accident.phase === 'cleanup' ? 'clean' : 'startle';
    offsetY = accident.phase === 'startle' && !reducedMotion ? 0.04 : 0;
  } else if (reaction?.characterId === 'barista') {
    facing = reaction.facing ?? facing;
    expression = reaction.gesture === 'laugh' ? 'laugh' : 'smile';
    gesture = reaction.gesture;
    offsetY = reaction.gesture === 'nod' && !reducedMotion ? (frame === 1 || frame === 2 ? -0.025 : 0) : 0;
  } else if (moment && momentParticipant) {
    ({ expression, gesture } = momentGesture(moment));
  }

  return {
    pose: barista.task,
    frame,
    facing,
    expression,
    gesture,
    offsetX: 0,
    offsetY,
    seated: false,
    activitySpotKind: undefined,
    momentKind: momentParticipant ? moment?.kind : undefined,
  };
}
