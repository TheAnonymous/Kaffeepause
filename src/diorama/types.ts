import type {
  CircleGeometry,
  ColorRepresentation,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SpotLight,
} from 'three';
import type { Point } from '../simulation/types';
import type { VenueKind } from '../venue';

export const DIORAMA = {
  width: 16,
  height: 8.8,
  depth: 7.2,
  renderScale: 6,
  spriteWidth: 144,
  spriteHeight: 208,
  standingHeight: 2.02,
  seatedHeight: 1.58,
} as const;

export const DIORAMA_SCALE = {
  tableHeight: 0.94,
  counterHeight: 1.36,
  doorHeight: 3.75,
  chairSeatHeight: 0.58,
  minimumWalkway: 1.35,
} as const;

export interface DioramaScaleReport {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly string[];
  readonly ratios: Readonly<{
    characterToRoom: number;
    tableToCharacter: number;
    counterToCharacter: number;
    doorToCharacter: number;
    seatedToStanding: number;
  }>;
}

/** Automated guardrail for every load and CI run, so furniture cannot silently outgrow people again. */
export function validateDioramaScale(): DioramaScaleReport {
  const issues: string[] = [];
  const between = (value: number, minimum: number, maximum: number, issue: string): void => {
    if (value < minimum || value > maximum) issues.push(issue);
  };
  const characterToRoom = DIORAMA.standingHeight / DIORAMA.height;
  const tableToCharacter = DIORAMA_SCALE.tableHeight / DIORAMA.standingHeight;
  const counterToCharacter = DIORAMA_SCALE.counterHeight / DIORAMA.standingHeight;
  const doorToCharacter = DIORAMA_SCALE.doorHeight / DIORAMA.standingHeight;
  const seatedToStanding = DIORAMA.seatedHeight / DIORAMA.standingHeight;
  between(characterToRoom, 0.2, 0.27, 'character-room-ratio');
  between(tableToCharacter, 0.42, 0.52, 'table-character-ratio');
  between(counterToCharacter, 0.6, 0.74, 'counter-character-ratio');
  between(doorToCharacter, 1.7, 2.05, 'door-character-ratio');
  between(seatedToStanding, 0.72, 0.84, 'seated-standing-ratio');
  if (DIORAMA.spriteHeight < 208 || DIORAMA.spriteWidth < 128) issues.push('character-texture-resolution');
  if (DIORAMA_SCALE.chairSeatHeight >= DIORAMA_SCALE.tableHeight * 0.75) issues.push('chair-table-clearance');
  if (DIORAMA_SCALE.minimumWalkway < DIORAMA.standingHeight * 0.62) issues.push('walkway-clearance');
  return {
    valid: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 14),
    issues,
    ratios: { characterToRoom, tableToCharacter, counterToCharacter, doorToCharacter, seatedToStanding },
  };
}

export const DIORAMA_SCALE_REPORT = validateDioramaScale();

export interface DioramaPoint {
  readonly x: number;
  readonly z: number;
}

export interface DioramaTheme {
  readonly wall: ColorRepresentation;
  readonly wallDark: ColorRepresentation;
  readonly floor: ColorRepresentation;
  readonly floorLine: ColorRepresentation;
  readonly wood: ColorRepresentation;
  readonly woodLight: ColorRepresentation;
  readonly metal: ColorRepresentation;
  readonly ink: ColorRepresentation;
  readonly glow: ColorRepresentation;
  readonly accent: ColorRepresentation;
  readonly neon: ColorRepresentation;
}

export interface AnimatedProp {
  readonly object: Object3D;
  readonly phase: number;
  readonly speed: number;
  readonly amplitude: number;
  readonly axis: 'x' | 'y' | 'z';
}

export interface DioramaSet {
  readonly root: Group;
  readonly doorPivot: Group;
  readonly practicalLights: readonly SpotLight[];
  readonly floorMaterial: MeshStandardMaterial;
  readonly exteriorMaterials: readonly MeshStandardMaterial[];
  readonly lightPools: readonly Mesh<CircleGeometry, MeshBasicMaterial>[];
  readonly animatedProps: readonly AnimatedProp[];
  readonly theme: DioramaTheme;
  dispose(): void;
}

export const DIORAMA_THEMES: Readonly<Record<VenueKind, DioramaTheme>> = {
  cafe: {
    wall: '#85574f', wallDark: '#4b353b', floor: '#30252d', floorLine: '#65434a',
    wood: '#734337', woodLight: '#b06f4f', metal: '#6e7880', ink: '#1b1720',
    glow: '#ffd18a', accent: '#d98a62', neon: '#f4bd73',
  },
  ramen: {
    wall: '#753d3d', wallDark: '#3a212c', floor: '#2a2329', floorLine: '#5d3c3d',
    wood: '#682f31', woodLight: '#b94e45', metal: '#7a7470', ink: '#18141c',
    glow: '#ffc267', accent: '#d84e42', neon: '#ff7455',
  },
  arcade: {
    wall: '#243650', wallDark: '#141d31', floor: '#172236', floorLine: '#32516d',
    wood: '#273b58', woodLight: '#426785', metal: '#435f7c', ink: '#101526',
    glow: '#70ebee', accent: '#ce55b7', neon: '#55dfe6',
  },
};

/** Maps the simulation's stable 384×216 floor plan into physical diorama space. */
export function worldToDiorama(point: Point): DioramaPoint {
  return {
    x: (point.x / 384 - 0.5) * DIORAMA.width,
    z: ((point.y - 130) / 86 - 0.5) * DIORAMA.depth,
  };
}

export function cameraPanForWorldX(cameraX: number): number {
  return (cameraX / 384) * DIORAMA.width;
}
