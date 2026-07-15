import type { ActivitySpotTag } from './layout';
import type { CafeMomentKind, BaristaTask } from './types';
import type { VenueKind } from '../venue';

export type MomentCategory = 'ritual' | 'encounter';
export type MomentWeatherCondition = 'wet' | 'rain' | 'wind';
export type MomentAudioCue =
  | 'cup' | 'plate' | 'chair' | 'door-bell'
  | 'bowl' | 'ladle' | 'curtain' | 'condiment'
  | 'button' | 'coin' | 'ticket' | 'relay';

export interface CinematicShotProfile {
  readonly approachSeconds: 2.2;
  readonly recoverSeconds: 2.8;
  readonly minimumOverviewSeconds: 20;
  readonly safeFrameInset: 0.1;
  readonly fieldOfView: readonly [number, number];
}

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
  readonly camera: CinematicShotProfile;
  readonly audioCue: MomentAudioCue;
  readonly staffTask?: BaristaTask;
  readonly crescendo?: true;
}

export const DEFAULT_CINEMATIC_SHOT: CinematicShotProfile = Object.freeze({
  approachSeconds: 2.2,
  recoverSeconds: 2.8,
  minimumOverviewSeconds: 20,
  safeFrameInset: 0.1,
  fieldOfView: [22, 26] as const,
});

const duration = (hold: number): MomentDefinition['duration'] => ({ enter: 1.4, hold, return: 1.6 });
const definition = (
  kind: CafeMomentKind,
  venue: VenueKind,
  category: MomentCategory,
  guestCount: 0 | 1 | 2,
  audioCue: MomentAudioCue,
  options: Partial<Pick<MomentDefinition, 'includesStaff' | 'anchorTags' | 'weather' | 'staffTask' | 'crescendo'>> = {},
): MomentDefinition => Object.freeze({
  kind, venue, category, guestCount, audioCue,
  includesStaff: options.includesStaff ?? false,
  anchorTags: Object.freeze(options.anchorTags ?? []),
  weather: options.weather,
  staffTask: options.staffTask,
  crescendo: options.crescendo,
  duration: Object.freeze(duration(options.crescendo ? 10 : 7)),
  cooldownSeconds: category === 'ritual' ? 70 : 82,
  camera: DEFAULT_CINEMATIC_SHOT,
});

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
