import type {
  GuestActivity,
  GuestBodyShape,
  GuestHairStyle,
  GuestOutfitStyle,
  GuestPersonalDetail,
} from './simulation/types';
import type { VenueKind } from './venue';

/**
 * Freundinnen und Freunde, die als Stammgäste vorbeikommen.
 *
 * Pflicht sind Name, Lieblingsort (`cafe`, `ramen`, `arcade`) und eine typische
 * Beschäftigung: `reading`, `typing`, `talking`, `drinking`, `phone`,
 * `sketching`, `journaling`, `knitting`, `board-game` oder `handheld` (GameBoy). Alles andere ist
 * optional; fehlende Angaben werden aus dem Namen passend ergänzt.
 *
 * Beispiel:
 *   {
 *     name: 'Sam', venue: 'ramen', activity: 'journaling',
 *     hair: 'curls', hairColor: '#3a2a22', outfit: 'hoodie', outfitColor: '#4f7c68', detail: 'glasses',
 *   },
 */
export interface Friend {
  readonly name: string;
  readonly venue: VenueKind;
  readonly activity: GuestActivity;
  /** crop, bob, curls, bun, long, undercut, ponytail, waves */
  readonly hair?: GuestHairStyle;
  readonly hairColor?: string;
  readonly skin?: string;
  /** cardigan, hoodie, jacket, sweater, overalls, dress */
  readonly outfit?: GuestOutfitStyle;
  readonly outfitColor?: string;
  readonly accentColor?: string;
  /** none, glasses, freckles, earring, beard, hairclip, mole */
  readonly detail?: GuestPersonalDetail;
  /** slim, soft, broad, compact, angular */
  readonly body?: GuestBodyShape;
}

export const FRIENDS: readonly Friend[] = [
  { name: 'Charles', venue: 'cafe', activity: 'handheld' },
];
