import type { ActivitySpotKind } from '../simulation/layout';
import type { GuestAppearance, GuestPalette } from '../simulation/types';
import type { VenueKind } from '../venue';
import { FLOOR_SURFACE_Y } from './types';

// Gemeinsame Maße der Klötzchen-Figuren. Alle Höhen zählen ab der Bodenoberkante.

export const FIGURE = {
  shoe: 0.1,
  shin: 0.26,
  thigh: 0.26,
  torso: 0.64,
  neck: 0.05,
  head: 0.62,
  hairTop: 0.12,
} as const;

export const HIP_HEIGHT = FIGURE.shoe + FIGURE.shin + FIGURE.thigh;

/** Oberkante der Sitzfläche über dem Boden je Möbel, passend zu `venueBuilder.ts`. */
export const SEAT_TOP_HEIGHT: Readonly<Record<ActivitySpotKind, number>> = {
  bench: 0.67 - FLOOR_SURFACE_Y,
  table: 0.58 - FLOOR_SURFACE_Y,
  'counter-stool': 0.64 - FLOOR_SURFACE_Y,
  lounge: 0.43 - FLOOR_SURFACE_Y,
  'arcade-cabinet': 0.58 - FLOOR_SURFACE_Y,
};

/** Kopfhöhe einer sitzenden Figur über dem Boden. */
export function seatedHeadHeight(kind: ActivitySpotKind | undefined): number {
  return SEAT_TOP_HEIGHT[kind ?? 'table'] + FIGURE.torso + FIGURE.neck + FIGURE.head + FIGURE.hairTop;
}

export const BARISTA_APPEARANCE: GuestAppearance = {
  body: 'angular', face: 'oval', hair: 'crop', outfit: 'overalls', detail: 'earring',
  maturity: 'adult', heightOffset: 1, widthOffset: 0, pattern: 2,
};

export const BARISTA_PALETTES: Readonly<Record<VenueKind, GuestPalette>> = {
  cafe: { skin: '#c98363', hair: '#241b24', coat: '#3e716b', accent: '#e7bd79', trousers: '#2c3440', shoes: '#1d1920' },
  ramen: { skin: '#c98363', hair: '#241b24', coat: '#a94342', accent: '#f0d09a', trousers: '#33262e', shoes: '#1d1920' },
  arcade: { skin: '#c98363', hair: '#241b24', coat: '#365a74', accent: '#56dde1', trousers: '#242d45', shoes: '#15192a' },
};
