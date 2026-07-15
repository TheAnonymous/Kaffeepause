import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { VenueKind } from '../venue';
import type { LoadedVenueArtPack } from './artAssets';
import { registerSelectiveBloomSurface } from './selectiveBloom';
import type { DioramaSet } from './types';

export interface VenueArtDecoration {
  readonly root: Group;
  readonly drawCalls: number;
  dispose(): void;
}

interface PlaneSpec {
  readonly region: string;
  readonly size: readonly [number, number];
  readonly position: readonly [number, number, number];
  readonly emissive?: boolean;
  readonly opacity?: number;
}

const DETAIL_PLANES: Readonly<Record<VenueKind, readonly PlaneSpec[]>> = {
  cafe: [
    { region: 'surface-wall', size: [2.15, 1.35], position: [-6.55, 4.35, -3.08], opacity: 0.68 },
    { region: 'prop-primary', size: [1.35, 1.18], position: [2.68, 1.35, -2.76] },
    { region: 'emission-primary', size: [0.68, 0.68], position: [-3.6, 6.48, -3.02], emissive: true, opacity: 0.72 },
  ],
  ramen: [
    { region: 'prop-noren', size: [5.6, 1.22], position: [-0.45, 3.68, -3.02], opacity: 0.78 },
    { region: 'prop-primary', size: [1.2, 1.05], position: [4.42, 1.9, -2.82] },
    { region: 'emission-primary', size: [3.4, 0.72], position: [-0.45, 5.5, -2.96], emissive: true, opacity: 0.7 },
  ],
  arcade: [
    { region: 'prop-poster', size: [1.55, 2.12], position: [-4.82, 4.15, -3.02], opacity: 0.82 },
    { region: 'foreground-detail', size: [1.58, 1.24], position: [3.12, 2.48, -2.98], opacity: 0.76 },
    { region: 'emission-magenta', size: [3.65, 0.68], position: [0, 5.05, -2.94], emissive: true, opacity: 0.76 },
  ],
};

const SURFACE_REGION: Readonly<Record<string, string>> = {
  floor: 'surface-floor',
  wood: 'surface-wood',
  plaster: 'surface-wall',
  tile: 'surface-tile',
  metal: 'surface-metal',
  glass: 'surface-glass',
  emissive: 'emission-primary',
};

function firstTexture(pack: LoadedVenueArtPack, ...ids: string[]): Texture | undefined {
  for (const id of ids) {
    const texture = pack.textureForRegion(id);
    if (texture) return texture;
  }
  return undefined;
}

function addDetailPlane(
  parent: Group,
  pack: LoadedVenueArtPack,
  spec: PlaneSpec,
  geometries: Set<PlaneGeometry | BoxGeometry>,
  materials: Set<Material>,
): void {
  const map = pack.textureForRegion(spec.region);
  if (!map) return;
  const geometry = new PlaneGeometry(...spec.size);
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    map,
    roughness: spec.emissive ? 0.28 : 0.74,
    metalness: spec.emissive ? 0.12 : 0.02,
    transparent: (spec.opacity ?? 1) < 1,
    opacity: spec.opacity ?? 1,
    depthWrite: true,
    side: DoubleSide,
    emissive: spec.emissive ? '#ffffff' : '#000000',
    emissiveMap: spec.emissive ? map : null,
    emissiveIntensity: spec.emissive ? 0.34 : 0,
  });
  const plane = new Mesh(geometry, material);
  plane.name = `art-detail:${spec.region}`;
  plane.position.set(...spec.position);
  plane.castShadow = false;
  plane.receiveShadow = false;
  if (spec.emissive) registerSelectiveBloomSurface(plane);
  geometries.add(geometry);
  materials.add(material);
  parent.add(plane);
}

function addInstancedProps(
  venue: VenueKind,
  parent: Group,
  pack: LoadedVenueArtPack,
  geometries: Set<PlaneGeometry | BoxGeometry>,
  materials: Set<Material>,
): void {
  const region = venue === 'arcade' ? 'prop-secondary' : 'prop-primary';
  const map = firstTexture(pack, region, 'foreground-detail');
  if (!map) return;
  const geometry = new BoxGeometry(0.22, venue === 'arcade' ? 0.24 : 0.18, 0.18);
  const material = new MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.46, metalness: venue === 'arcade' ? 0.18 : 0.04 });
  const positions: readonly (readonly [number, number, number])[] = venue === 'cafe'
    ? [[4.55, 1.47, -2.12], [4.92, 1.47, -2.12], [5.3, 1.47, -2.12], [5.68, 1.47, -2.12], [6.05, 1.47, -2.12], [6.42, 1.47, -2.12]]
    : venue === 'ramen'
      ? [[-5.8, 1.48, -1.73], [-4.2, 1.48, -1.73], [-2.6, 1.48, -1.73], [-1, 1.48, -1.73], [0.6, 1.48, -1.73], [2.2, 1.48, -1.73]]
      : [[2.52, 1.42, -2.42], [2.86, 1.42, -2.42], [3.2, 1.42, -2.42], [3.54, 1.42, -2.42], [3.88, 1.42, -2.42], [4.22, 1.42, -2.42]];
  const props = new InstancedMesh(geometry, material, positions.length);
  props.name = `art-instanced-props:${venue}`;
  const matrix = new Matrix4();
  for (const [index, position] of positions.entries()) {
    matrix.makeTranslation(...position);
    props.setMatrixAt(index, matrix);
  }
  props.instanceMatrix.needsUpdate = true;
  props.castShadow = true;
  props.receiveShadow = true;
  geometries.add(geometry);
  materials.add(material);
  parent.add(props);
}

function countDrawables(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof InstancedMesh) count += 1;
  });
  return count;
}

export function decorateVenueWithArtPack(set: DioramaSet, pack: LoadedVenueArtPack): VenueArtDecoration {
  const root = new Group();
  root.name = `venue-art:${pack.id}`;
  const geometries = new Set<PlaneGeometry | BoxGeometry>();
  const materials = new Set<Material>();
  const decoratedMaterials = new Set<MeshStandardMaterial>();

  for (const [surfaceKind, entries] of set.surfaceMaterials) {
    const region = SURFACE_REGION[surfaceKind];
    const texture = firstTexture(pack, region ?? '', 'surface-wall', 'surface-floor');
    if (!texture) continue;
    for (const material of entries) {
      material.roughnessMap = texture;
      material.bumpMap = texture;
      material.bumpScale = surfaceKind === 'floor' ? 0.018 : surfaceKind === 'metal' ? 0.008 : 0.028;
      material.needsUpdate = true;
      decoratedMaterials.add(material);
    }
  }

  for (const spec of DETAIL_PLANES[pack.venue]) addDetailPlane(root, pack, spec, geometries, materials);
  addInstancedProps(pack.venue, root, pack, geometries, materials);
  set.root.add(root);

  let disposed = false;
  return {
    root,
    drawCalls: countDrawables(root),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const material of decoratedMaterials) {
        material.roughnessMap = null;
        material.bumpMap = null;
        material.needsUpdate = true;
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      root.removeFromParent();
    },
  };
}
