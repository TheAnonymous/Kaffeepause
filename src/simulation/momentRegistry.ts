import type { ActivitySpotTag } from './layout';
import type { CafeMomentKind, BaristaTask } from './types';
import type { VenueKind } from '../venue';
import {
  cinematicSequenceDuration,
  cinematicSequenceProfile,
  type CinematicSequenceProfileId,
} from '../diorama/cinematicSequence';

export type MomentCategory = 'ritual' | 'encounter';
export type MomentWeatherCondition = 'wet' | 'rain' | 'wind';
export type MomentAudioCue =
  | 'cup' | 'plate' | 'chair' | 'door-bell'
  | 'bowl' | 'ladle' | 'curtain' | 'condiment'
  | 'button' | 'coin' | 'ticket' | 'relay';

export interface MomentFoleyCue {
  readonly type: 'foley';
  readonly atSeconds: number;
  readonly cue: MomentAudioCue;
  readonly pan: number;
  readonly gain: number;
  readonly playbackRate: readonly [number, number];
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
}

export interface MomentLightCue {
  readonly type: 'light';
  readonly atSeconds: number;
  readonly intensity: number;
  readonly durationSeconds: number;
}

export type MomentStageCue = MomentFoleyCue | MomentLightCue;

export interface MomentDefinition {
  readonly kind: CafeMomentKind;
  readonly venue: VenueKind;
  readonly category: MomentCategory;
  readonly guestCount: 0 | 1 | 2;
  readonly includesStaff: boolean;
  readonly anchorTags: readonly ActivitySpotTag[];
  readonly weather?: MomentWeatherCondition;
  readonly duration: Readonly<{ enter: number; hold: number; return: number }>;
  readonly cooldownSeconds: number;
  readonly camera: CinematicSequenceProfileId;
  readonly propAnchor: Readonly<{ x: number; y: number }>;
  readonly cues: readonly MomentStageCue[];
  readonly audioCue: MomentAudioCue;
  readonly staffTask?: BaristaTask;
  readonly crescendo?: true;
}

const duration = (camera: CinematicSequenceProfileId): MomentDefinition['duration'] => {
  const total = cinematicSequenceDuration(cinematicSequenceProfile(camera));
  return { enter: 2.2, hold: total - 5, return: 2.8 };
};
const definition = (
  kind: CafeMomentKind,
  venue: VenueKind,
  category: MomentCategory,
  guestCount: 0 | 1 | 2,
  audioCue: MomentAudioCue,
  options: Partial<Pick<MomentDefinition, 'includesStaff' | 'anchorTags' | 'weather' | 'staffTask' | 'crescendo'>> = {},
): MomentDefinition => {
  const camera = `moment:${kind}` as const;
  const profile = cinematicSequenceProfile(camera);
  if (!profile.propAnchor) throw new Error(`Requisitenanker fehlt: ${kind}`);
  const pan = Math.max(-0.78, Math.min(0.78, (profile.propAnchor.x / 384 - 0.5) * 1.56));
  const detailAt = 2.2 + 2.4;
  const reactionAt = detailAt + 1.4 + (profile.crescendo ? 3.4 : 2);
  return Object.freeze({
    kind, venue, category, guestCount, audioCue,
    includesStaff: options.includesStaff ?? false,
    anchorTags: Object.freeze(options.anchorTags ?? []),
    weather: options.weather,
    staffTask: options.staffTask,
    crescendo: options.crescendo,
    duration: Object.freeze(duration(camera)),
    cooldownSeconds: category === 'ritual' ? 70 : 82,
    camera,
    propAnchor: profile.propAnchor,
    cues: Object.freeze([
      Object.freeze({
        type: 'foley', atSeconds: 2.24, cue: audioCue, pan, gain: 0.82,
        playbackRate: [0.975, 1.025] as const, attackSeconds: 0.012, releaseSeconds: 0.16,
      }),
      Object.freeze({
        type: 'light', atSeconds: detailAt, intensity: profile.crescendo ? 1 : 0.72,
        durationSeconds: profile.crescendo ? 6.6 : 4.8,
      }),
      Object.freeze({
        type: 'foley', atSeconds: reactionAt, cue: audioCue, pan: -pan * 0.45, gain: 0.42,
        playbackRate: [0.985, 1.015] as const, attackSeconds: 0.008, releaseSeconds: 0.1,
      }),
    ]),
  });
};

/** The complete V2 set: exactly three rituals and three encounters per venue. */
export const MOMENT_REGISTRY: readonly MomentDefinition[] = Object.freeze([
  definition('pastry-restock', 'cafe', 'ritual', 0, 'plate', { includesStaff: true, staffTask: 'restocking' }),
  definition('table-reset', 'cafe', 'ritual', 0, 'chair', { includesStaff: true, staffTask: 'wiping' }),
  definition('window-rain-trace', 'cafe', 'ritual', 1, 'cup', { anchorTags: ['window'], weather: 'rain', crescendo: true }),
  definition('pencil-return', 'cafe', 'encounter', 2, 'plate', { anchorTags: ['table-pair'] }),
  definition('warm-cup-offer', 'cafe', 'encounter', 1, 'cup', { includesStaff: true, anchorTags: ['table-pair'], staffTask: 'serving' }),
  definition('doorway-greeting', 'cafe', 'encounter', 1, 'door-bell', { includesStaff: true, staffTask: 'polishing' }),

  definition('broth-lid-lift', 'ramen', 'ritual', 0, 'ladle', { includesStaff: true, staffTask: 'machine', crescendo: true }),
  definition('bowl-pass', 'ramen', 'ritual', 1, 'bowl', { includesStaff: true, anchorTags: ['counter-adjacent'], staffTask: 'serving' }),
  definition('noren-gust', 'ramen', 'ritual', 1, 'curtain', { anchorTags: ['counter-adjacent'], weather: 'wind' }),
  definition('condiment-pass', 'ramen', 'encounter', 2, 'condiment', { anchorTags: ['counter-adjacent'] }),
  definition('last-gyoza-offer', 'ramen', 'encounter', 2, 'plate', { anchorTags: ['counter-adjacent'] }),
  definition('napkin-save', 'ramen', 'encounter', 2, 'bowl', { anchorTags: ['counter-adjacent'] }),

  definition('attract-mode-wave', 'arcade', 'ritual', 1, 'button', { anchorTags: ['cabinet-pair'], crescendo: true }),
  definition('token-hopper-refill', 'arcade', 'ritual', 0, 'coin', { includesStaff: true, staffTask: 'restocking' }),
  definition('cabinet-reboot', 'arcade', 'ritual', 1, 'relay', { includesStaff: true, anchorTags: ['cabinet-pair'], staffTask: 'polishing' }),
  definition('ticket-trade', 'arcade', 'encounter', 2, 'ticket', { anchorTags: ['cabinet-pair'] }),
  definition('coop-rescue', 'arcade', 'encounter', 2, 'button', { anchorTags: ['cabinet-pair'] }),
  definition('lounge-prize-share', 'arcade', 'encounter', 2, 'ticket', { anchorTags: ['lounge'] }),
]);

export const MOMENT_DEFINITIONS = new Map(MOMENT_REGISTRY.map((entry) => [entry.kind, entry]));

export function momentDefinition(kind: CafeMomentKind): MomentDefinition | undefined {
  return MOMENT_DEFINITIONS.get(kind);
}

export function momentDurationSeconds(entry: MomentDefinition): number {
  return entry.duration.enter + entry.duration.hold + entry.duration.return;
}

export function venueMomentPool(venue: VenueKind): readonly MomentDefinition[] {
  return MOMENT_REGISTRY.filter((entry) => entry.venue === venue);
}
