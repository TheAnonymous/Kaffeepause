import { SCENE_PROPORTIONS } from '../scene/proportions';
import type { GuestAppearance, RegularId } from './types';

export const GUEST_APPEARANCE_PRESETS: readonly GuestAppearance[] = [
  { body: 'soft', face: 'round', hair: 'bun', outfit: 'cardigan', detail: 'freckles', maturity: 'adult', heightOffset: 0, widthOffset: 0.5, pattern: 0 },
  { body: 'angular', face: 'narrow', hair: 'long', outfit: 'jacket', detail: 'earring', maturity: 'adult', heightOffset: 1, widthOffset: 0, pattern: 1 },
  { body: 'broad', face: 'square', hair: 'crop', outfit: 'sweater', detail: 'glasses', maturity: 'older', heightOffset: 1.5, widthOffset: 1, pattern: 2 },
  { body: 'compact', face: 'round', hair: 'curls', outfit: 'overalls', detail: 'none', maturity: 'young', heightOffset: -1.5, widthOffset: 0.5, pattern: 3 },
  { body: 'slim', face: 'oval', hair: 'bob', outfit: 'hoodie', detail: 'hairclip', maturity: 'young', heightOffset: 0.5, widthOffset: -1, pattern: 4 },
  { body: 'broad', face: 'oval', hair: 'undercut', outfit: 'jacket', detail: 'beard', maturity: 'adult', heightOffset: 0, widthOffset: 1, pattern: 5 },
  { body: 'slim', face: 'narrow', hair: 'ponytail', outfit: 'dress', detail: 'mole', maturity: 'adult', heightOffset: 1.5, widthOffset: -0.5, pattern: 0 },
  { body: 'soft', face: 'square', hair: 'waves', outfit: 'sweater', detail: 'glasses', maturity: 'older', heightOffset: -0.5, widthOffset: 1, pattern: 1 },
  { body: 'compact', face: 'oval', hair: 'crop', outfit: 'hoodie', detail: 'earring', maturity: 'young', heightOffset: -1, widthOffset: -0.5, pattern: 2 },
  { body: 'angular', face: 'round', hair: 'curls', outfit: 'cardigan', detail: 'freckles', maturity: 'adult', heightOffset: 0.5, widthOffset: 0, pattern: 3 },
  { body: 'soft', face: 'narrow', hair: 'long', outfit: 'overalls', detail: 'hairclip', maturity: 'young', heightOffset: 1, widthOffset: 0.5, pattern: 4 },
  { body: 'slim', face: 'square', hair: 'bun', outfit: 'dress', detail: 'none', maturity: 'older', heightOffset: -0.5, widthOffset: -1, pattern: 5 },
];

export const REGULAR_APPEARANCES: Readonly<Record<RegularId, GuestAppearance>> = {
  mara: GUEST_APPEARANCE_PRESETS[0] as GuestAppearance,
  noor: GUEST_APPEARANCE_PRESETS[1] as GuestAppearance,
  toni: GUEST_APPEARANCE_PRESETS[2] as GuestAppearance,
  linn: GUEST_APPEARANCE_PRESETS[3] as GuestAppearance,
  sora: GUEST_APPEARANCE_PRESETS[4] as GuestAppearance,
  kai: GUEST_APPEARANCE_PRESETS[5] as GuestAppearance,
  bo: GUEST_APPEARANCE_PRESETS[6] as GuestAppearance,
  cleo: GUEST_APPEARANCE_PRESETS[7] as GuestAppearance,
  jun: GUEST_APPEARANCE_PRESETS[8] as GuestAppearance,
  emi: GUEST_APPEARANCE_PRESETS[9] as GuestAppearance,
  ari: GUEST_APPEARANCE_PRESETS[10] as GuestAppearance,
  mika: GUEST_APPEARANCE_PRESETS[11] as GuestAppearance,
};

export interface GuestGeometry {
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly shoulderHalf: number;
  readonly hemHalf: number;
  readonly headWidth: number;
  readonly headHeight: number;
  readonly legWidth: number;
}

const BODY_GEOMETRY: Readonly<Record<GuestAppearance['body'], { shoulder: number; hem: number; leg: number }>> = {
  slim: { shoulder: -0.6, hem: -0.9, leg: 3 },
  soft: { shoulder: 0.1, hem: 0.8, leg: 3.5 },
  broad: { shoulder: 0.8, hem: 0.3, leg: 4 },
  compact: { shoulder: 0.3, hem: 0.6, leg: 3.5 },
  angular: { shoulder: 0.7, hem: -0.2, leg: 3.5 },
};

const FACE_GEOMETRY: Readonly<Record<GuestAppearance['face'], { width: number; height: number }>> = {
  round: { width: 11, height: 10 },
  oval: { width: 10.5, height: 10.5 },
  square: { width: 11.5, height: 9.5 },
  narrow: { width: 9.5, height: 10.5 },
};

export function appearanceForGuestNumber(numericId: number): GuestAppearance {
  return GUEST_APPEARANCE_PRESETS[(Math.max(1, numericId) - 1) % GUEST_APPEARANCE_PRESETS.length] as GuestAppearance;
}

export function geometryForGuest(appearance: GuestAppearance, seated: boolean): GuestGeometry {
  const body = BODY_GEOMETRY[appearance.body];
  const face = FACE_GEOMETRY[appearance.face];
  const bodyWidth = SCENE_PROPORTIONS.character.bodyWidth + appearance.widthOffset;
  const heightInfluence = seated ? appearance.heightOffset * 0.3 : appearance.heightOffset;
  return {
    bodyWidth,
    bodyHeight: (seated ? SCENE_PROPORTIONS.character.seatedBodyHeight : SCENE_PROPORTIONS.character.standingBodyHeight) + heightInfluence,
    shoulderHalf: bodyWidth / 2 - 1 + body.shoulder,
    hemHalf: bodyWidth / 2 - 0.5 + body.hem,
    headWidth: face.width,
    headHeight: face.height,
    legWidth: body.leg,
  };
}

export interface AppearanceLibraryReport {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly string[];
  readonly uniqueSilhouettes: number;
}

export function validateAppearanceLibrary(appearances: readonly GuestAppearance[] = GUEST_APPEARANCE_PRESETS): AppearanceLibraryReport {
  const issues: string[] = [];
  const signatures = new Set<string>();
  const hairStyles = new Set<string>();
  const outfits = new Set<string>();
  const bodies = new Set<string>();

  for (const appearance of appearances) {
    const standing = geometryForGuest(appearance, false);
    const seated = geometryForGuest(appearance, true);
    signatures.add(`${appearance.body}:${appearance.face}:${appearance.hair}:${appearance.outfit}:${appearance.detail}`);
    hairStyles.add(appearance.hair);
    outfits.add(appearance.outfit);
    bodies.add(appearance.body);
    if (standing.bodyWidth < 11.5 || standing.bodyWidth > 14.5) issues.push(`body-width:${appearance.body}`);
    if (standing.bodyHeight < 18.5 || standing.bodyHeight > 22.5) issues.push(`body-height:${appearance.body}`);
    if (standing.headWidth < 9 || standing.headWidth > 12) issues.push(`head-width:${appearance.face}`);
    if (standing.headHeight < 9 || standing.headHeight > 11) issues.push(`head-height:${appearance.face}`);
    if (seated.bodyHeight + standing.headHeight > SCENE_PROPORTIONS.character.seatedHeight + 1) issues.push(`seated-height:${appearance.body}`);
  }

  if (signatures.size < Math.ceil(appearances.length * 0.9)) issues.push('duplicate-silhouettes');
  if (hairStyles.size < 7) issues.push('hair-variety');
  if (outfits.size < 6) issues.push('outfit-variety');
  if (bodies.size < 5) issues.push('body-variety');

  return {
    valid: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 10),
    issues,
    uniqueSilhouettes: signatures.size,
  };
}

export const APPEARANCE_LIBRARY_REPORT = validateAppearanceLibrary();
