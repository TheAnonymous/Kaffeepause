import type { VenueKind } from '../venue';

export type SurfaceKind = 'plaster' | 'wood' | 'tile' | 'metal' | 'glass' | 'floor' | 'emissive';

export interface SurfaceRecipe {
  readonly kind: SurfaceKind;
  readonly size: number;
  readonly base: string;
  readonly detail: string;
  readonly highlight: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly repeat: readonly [number, number];
}

export interface FocusFrameBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface VenueVisualProfile {
  readonly id: VenueKind;
  readonly palette: Readonly<{
    wall: string;
    wallDark: string;
    floor: string;
    floorLine: string;
    wood: string;
    woodLight: string;
    metal: string;
    ink: string;
    glow: string;
    accent: string;
    neon: string;
  }>;
  readonly shadowColor: string;
  readonly lights: Readonly<{
    key: string;
    fill: string;
    practical: string;
    characterRim: string;
    focus: string;
  }>;
  readonly surfaces: Readonly<Record<SurfaceKind, SurfaceRecipe>>;
  readonly bloom: Readonly<{
    minimum: number;
    maximum: number;
    threshold: number;
    radius: number;
  }>;
  readonly contrast: Readonly<{
    minimumShadowLift: number;
    maximumShadowLift: number;
    minimumCharacterContrast: number;
    saturation: readonly [number, number];
  }>;
  readonly camera: Readonly<{
    focusFov: readonly [number, number];
    safeArea: Readonly<FocusFrameBounds>;
  }>;
}

const surface = (
  kind: SurfaceKind,
  base: string,
  detail: string,
  highlight: string,
  roughness: number,
  metalness: number,
  repeat: readonly [number, number],
  size = 32,
): SurfaceRecipe => ({ kind, size, base, detail, highlight, roughness, metalness, repeat });

const SAFE_AREA: FocusFrameBounds = {
  left: 0.1,
  top: 0.1,
  right: 0.9,
  bottom: 0.9,
  width: 0.8,
  height: 0.8,
};

export const VENUE_VISUAL_PROFILES: Readonly<Record<VenueKind, VenueVisualProfile>> = {
  cafe: {
    id: 'cafe',
    palette: {
      wall: '#875f57', wallDark: '#503c3e', floor: '#382a2d', floorLine: '#725044',
      wood: '#754837', woodLight: '#b47750', metal: '#7b8588', ink: '#211b20',
      glow: '#f3b75e', accent: '#b96e42', neon: '#d49755',
    },
    shadowColor: '#1c1c25',
    lights: { key: '#ffd7a0', fill: '#66869a', practical: '#f1ae51', characterRim: '#efc477', focus: '#ffd894' },
    surfaces: {
      plaster: surface('plaster', '#f0e5df', '#c9b7b0', '#fff6ee', 0.88, 0, [2, 2]),
      wood: surface('wood', '#ead1b8', '#9f6e51', '#fff0d2', 0.7, 0.01, [2, 1]),
      tile: surface('tile', '#e9ddd2', '#a9968e', '#fff7ec', 0.56, 0.02, [3, 2]),
      metal: surface('metal', '#c6cccb', '#717b7e', '#f4f7ef', 0.29, 0.72, [2, 2]),
      glass: surface('glass', '#dcecee', '#8fb0b6', '#ffffff', 0.12, 0.06, [2, 1]),
      floor: surface('floor', '#d8c0a9', '#81563f', '#f2dec3', 0.58, 0.05, [3, 2]),
      emissive: surface('emissive', '#ffffff', '#e9c27d', '#ffffff', 0.24, 0.02, [2, 2]),
    },
    bloom: { minimum: 0.12, maximum: 0.22, threshold: 0.9, radius: 0.34 },
    contrast: { minimumShadowLift: 0.06, maximumShadowLift: 0.15, minimumCharacterContrast: 2.3, saturation: [0.98, 1.05] },
    camera: { focusFov: [22, 26], safeArea: SAFE_AREA },
  },
  ramen: {
    id: 'ramen',
    palette: {
      wall: '#68484a', wallDark: '#39343c', floor: '#323039', floorLine: '#625552',
      wood: '#693e38', woodLight: '#a85a48', metal: '#879294', ink: '#211e27',
      glow: '#f3b75b', accent: '#a83b2f', neon: '#d56a3d',
    },
    shadowColor: '#18202a',
    lights: { key: '#f5c98c', fill: '#7895a2', practical: '#edaa50', characterRim: '#a7c6c8', focus: '#f5cf89' },
    surfaces: {
      plaster: surface('plaster', '#e6ddd9', '#b8a9a8', '#fff4eb', 0.86, 0, [2, 2]),
      wood: surface('wood', '#dfbdab', '#93594c', '#f9d8b8', 0.67, 0.01, [2, 1]),
      tile: surface('tile', '#dce9e9', '#728d94', '#f8ffff', 0.45, 0.03, [3, 2]),
      metal: surface('metal', '#c7d0d0', '#68777b', '#f5ffff', 0.24, 0.78, [2, 2]),
      glass: surface('glass', '#d8e7e8', '#829fa5', '#ffffff', 0.1, 0.08, [2, 1]),
      floor: surface('floor', '#c3c4c0', '#63656a', '#e8e9df', 0.5, 0.12, [3, 2]),
      emissive: surface('emissive', '#ffffff', '#e8a35d', '#ffffff', 0.22, 0.02, [2, 2]),
    },
    bloom: { minimum: 0.12, maximum: 0.23, threshold: 0.9, radius: 0.34 },
    contrast: { minimumShadowLift: 0.065, maximumShadowLift: 0.16, minimumCharacterContrast: 2.35, saturation: [0.98, 1.04] },
    camera: { focusFov: [22, 26], safeArea: SAFE_AREA },
  },
  arcade: {
    id: 'arcade',
    palette: {
      wall: '#40516c', wallDark: '#29364d', floor: '#29394f', floorLine: '#477b99',
      wood: '#3b526a', woodLight: '#607e98', metal: '#6c8499', ink: '#151d2d',
      glow: '#4bc9cf', accent: '#b44794', neon: '#3ccbd1',
    },
    shadowColor: '#101827',
    lights: { key: '#9db6bb', fill: '#526789', practical: '#d7ad64', characterRim: '#68d8d8', focus: '#9ee5dd' },
    surfaces: {
      plaster: surface('plaster', '#cad2df', '#72809b', '#eef4ff', 0.76, 0.02, [2, 2]),
      wood: surface('wood', '#bdc6d6', '#576d8d', '#e7efff', 0.6, 0.04, [2, 1]),
      tile: surface('tile', '#bfcbd8', '#526984', '#ebf7ff', 0.43, 0.08, [3, 2]),
      metal: surface('metal', '#bac8d4', '#4d6178', '#edfaff', 0.23, 0.76, [2, 2]),
      glass: surface('glass', '#c5e4e8', '#4e8794', '#ffffff', 0.09, 0.12, [2, 1]),
      floor: surface('floor', '#9db4c8', '#355878', '#d2f4f4', 0.31, 0.28, [3, 2]),
      emissive: surface('emissive', '#ffffff', '#68dfe5', '#ffffff', 0.18, 0.08, [2, 2]),
    },
    bloom: { minimum: 0.16, maximum: 0.3, threshold: 0.91, radius: 0.3 },
    contrast: { minimumShadowLift: 0.075, maximumShadowLift: 0.18, minimumCharacterContrast: 2.5, saturation: [1.01, 1.08] },
    camera: { focusFov: [22, 26], safeArea: SAFE_AREA },
  },
};

export function focusBoundsAreSafe(
  bounds: Readonly<FocusFrameBounds>,
  safeArea: Readonly<FocusFrameBounds>,
): boolean {
  return bounds.left >= safeArea.left
    && bounds.right <= safeArea.right
    && bounds.top >= safeArea.top
    && bounds.bottom <= safeArea.bottom;
}

export function colorLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function colorContrast(left: string, right: string): number {
  const leftLuminance = colorLuminance(left);
  const rightLuminance = colorLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05) / (Math.min(leftLuminance, rightLuminance) + 0.05);
}
