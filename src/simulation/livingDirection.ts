import type { GuestActivity, Point } from './types';
import type { ActivitySpotTag } from './layout';
import type { VenueKind } from '../venue';

export interface LivingDirectionStop extends Point {
  readonly id: string;
  readonly dwellSeconds: number;
  readonly facing: -1 | 1;
  readonly activity: GuestActivity;
  readonly via?: readonly Readonly<Point>[];
}

export interface LivingDirectionRoute {
  readonly id: string;
  readonly venue: VenueKind;
  readonly title: string;
  readonly eligibleTags: readonly ActivitySpotTag[];
  readonly stops: readonly LivingDirectionStop[];
  readonly cooldownSeconds: number;
  readonly returnVia: readonly Readonly<Point>[];
  readonly signature?: true;
}

const route = (
  venue: VenueKind,
  id: string,
  title: string,
  eligibleTags: readonly ActivitySpotTag[],
  stops: readonly LivingDirectionStop[],
  cooldownSeconds: number,
  signature = false,
  returnVia: readonly Readonly<Point>[] = [],
): LivingDirectionRoute => Object.freeze({
  id,
  venue,
  title,
  eligibleTags: Object.freeze([...eligibleTags]),
  stops: Object.freeze(stops.map((stop) => Object.freeze({
    ...stop,
    ...(stop.via ? { via: Object.freeze(stop.via.map((point) => Object.freeze({ ...point }))) } : {}),
  }))),
  cooldownSeconds,
  returnVia: Object.freeze(returnVia.map((point) => Object.freeze({ ...point }))),
  ...(signature ? { signature: true as const } : {}),
});

/**
 * Authored room-scale performances. These are deliberately sparse: every walk
 * has a readable purpose, a destination and a return instead of random roaming.
 */
export const LIVING_DIRECTION_ROUTES: readonly LivingDirectionRoute[] = Object.freeze([
  route('cafe', 'cafe-window-to-pastry', 'Vom Fenster zur Kuchenvitrine', ['window'], [
    {
      id: 'cafe-pastry-view', x: 252, y: 184, dwellSeconds: 3.4, facing: 1, activity: 'drinking',
      via: [{ x: 80, y: 210 }, { x: 238, y: 210 }],
    },
    {
      id: 'cafe-window-breath', x: 44, y: 174, dwellSeconds: 2.8, facing: -1, activity: 'phone',
      via: [{ x: 238, y: 210 }, { x: 70, y: 210 }],
    },
  ], 64, true),
  route('cafe', 'cafe-table-cup-return', 'Tasse zurück an die Theke', ['table-pair'], [
    {
      id: 'cafe-cup-return', x: 262, y: 190, dwellSeconds: 2.6, facing: 1, activity: 'drinking',
      via: [{ x: 230, y: 210 }],
    },
  ], 48, false, [{ x: 230, y: 210 }]),
  route('cafe', 'cafe-doorway-greeting-walk', 'Kurzer Gruß an der Tür', ['window', 'table-pair'], [
    {
      id: 'cafe-doorway-pause', x: 48, y: 198, dwellSeconds: 2.4, facing: -1, activity: 'talking',
      via: [{ x: 70, y: 210 }],
    },
  ], 55, false, [{ x: 70, y: 210 }]),

  route('ramen', 'ramen-counter-water', 'Wasser holen und zur Theke zurückkehren', ['counter-adjacent'], [
    {
      id: 'ramen-water-station', x: 52, y: 190, dwellSeconds: 3.1, facing: -1, activity: 'drinking',
      via: [{ x: 230, y: 210 }, { x: 72, y: 210 }],
    },
    {
      id: 'ramen-pass-pause', x: 242, y: 184, dwellSeconds: 2.5, facing: 1, activity: 'talking',
      via: [{ x: 72, y: 210 }, { x: 230, y: 210 }],
    },
  ], 58, true, [{ x: 230, y: 210 }]),
  route('ramen', 'ramen-noren-breath', 'Ein Atemzug am Noren', ['counter-adjacent', 'table-pair'], [
    {
      id: 'ramen-noren-pause', x: 350, y: 170, dwellSeconds: 2.8, facing: 1, activity: 'phone',
      via: [{ x: 300, y: 210 }],
    },
  ], 52, false, [{ x: 300, y: 210 }]),
  route('ramen', 'ramen-condiment-walk', 'Gewürze von der Seitenstation holen', ['counter-adjacent'], [
    { id: 'ramen-condiment-station', x: 280, y: 200, dwellSeconds: 2.7, facing: -1, activity: 'drinking' },
  ], 46),

  route('arcade', 'arcade-token-lane', 'Token holen und durch die Spielgasse zurück', ['cabinet-pair'], [
    {
      id: 'arcade-token-pause', x: 224, y: 154, dwellSeconds: 2.8, facing: 1, activity: 'phone',
      via: [{ x: 192, y: 180 }],
    },
    { id: 'arcade-lane-pause', x: 192, y: 180, dwellSeconds: 2.5, facing: -1, activity: 'talking' },
  ], 54, true, [{ x: 192, y: 180 }]),
  route('arcade', 'arcade-prize-browse', 'Ein Blick ins Preisregal', ['cabinet-pair', 'lounge'], [
    { id: 'arcade-prize-pause', x: 298, y: 190, dwellSeconds: 3.2, facing: 1, activity: 'phone' },
  ], 50, false, [{ x: 268, y: 186 }, { x: 192, y: 186 }]),
  route('arcade', 'arcade-lounge-loop', 'Kurze Pause am Rand der Spielgasse', ['cabinet-pair'], [
    { id: 'arcade-lounge-edge', x: 192, y: 184, dwellSeconds: 3, facing: -1, activity: 'talking' },
  ], 45),
]);

export const LIVING_ROUTES_BY_VENUE: Readonly<Record<VenueKind, readonly LivingDirectionRoute[]>> = Object.freeze({
  cafe: Object.freeze(LIVING_DIRECTION_ROUTES.filter((entry) => entry.venue === 'cafe')),
  ramen: Object.freeze(LIVING_DIRECTION_ROUTES.filter((entry) => entry.venue === 'ramen')),
  arcade: Object.freeze(LIVING_DIRECTION_ROUTES.filter((entry) => entry.venue === 'arcade')),
});

export const GOLDEN_LIVING_SEQUENCES: Readonly<Record<VenueKind, string>> = Object.freeze({
  cafe: 'cafe-window-to-pastry',
  ramen: 'ramen-counter-water',
  arcade: 'arcade-token-lane',
});

export function livingDirectionRoute(id?: string): LivingDirectionRoute | undefined {
  return id ? LIVING_DIRECTION_ROUTES.find((entry) => entry.id === id) : undefined;
}
