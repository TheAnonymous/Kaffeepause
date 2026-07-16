import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Texture,
} from 'three';
import type { VenueKind } from '../venue';
import type { LoadedVenueArtPack } from './artAssets';
import type { DioramaSet } from './types';

export interface VenueArtDecoration {
  readonly root: Group;
  readonly drawCalls: number;
  dispose(): void;
}

interface DetailPlaneSpec {
  readonly region: string;
  readonly size: readonly [number, number];
  readonly position: readonly [number, number, number];
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly opacity?: number;
  readonly depthWrite?: boolean;
  readonly unlit?: boolean;
}

/**
 * Each room gets a few deliberately placed hero details, never a wallpaper of
 * repeated generated props. Every crop was reviewed at native size and is free
 * of people and lettering, keeping the simulation's authored characters and
 * stories visually authoritative.
 */
const DETAIL_PLANES: Readonly<Record<VenueKind, readonly DetailPlaneSpec[]>> = {
  cafe: [
    { region: 'surface-glass', size: [10.45, 5.72], position: [-0.45, 4.36, -3.66], opacity: 0.82, depthWrite: false, unlit: true },
    { region: 'prop-primary', size: [1.34, 1.08], position: [2.68, 0.73, -1.24], opacity: 0.92 },
    { region: 'surface-metal', size: [1.06, 1.06], position: [6.2, 1.89, -1.75], opacity: 0.9 },
    { region: 'foreground-detail', size: [1.22, 1.22], position: [-6.3, 2.1, -2.94], opacity: 0.88 },
  ],
  ramen: [
    { region: 'surface-metal', size: [3.1, 1.72], position: [-4.48, 2.52, -2.9], opacity: 0.84, unlit: true },
    { region: 'prop-noren', size: [10.25, 1.58], position: [-0.48, 4.03, -2.96], opacity: 0.94 },
    { region: 'foreground-detail', size: [0.86, 0.86], position: [5.9, 0.7, 2.39], opacity: 0.9 },
  ],
  arcade: [
    { region: 'foreground-detail', size: [5.05, 3.2], position: [0, 0.17, 1.2], rotationX: -Math.PI / 2, opacity: 0.86, depthWrite: false, unlit: true },
    { region: 'prop-poster', size: [2.36, 2.28], position: [3.2, 2.75, -2.94], opacity: 0.82, unlit: true },
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
  spec: DetailPlaneSpec,
  geometries: Set<PlaneGeometry>,
  materials: Set<Material>,
): void {
  const map = pack.textureForRegion(spec.region);
  if (!map) return;
  const opacity = spec.opacity ?? 1;
  const geometry = new PlaneGeometry(...spec.size);
  const shared = {
    color: '#ffffff', map, transparent: opacity < 1, opacity,
    depthWrite: spec.depthWrite ?? opacity >= 0.9, side: DoubleSide, alphaTest: 0.01,
  } as const;
  const material: Material = spec.unlit
    ? new MeshBasicMaterial(shared)
    : new MeshStandardMaterial({
      ...shared,
      roughness: spec.region === 'surface-metal' ? 0.42 : 0.76,
      metalness: spec.region === 'surface-metal' ? 0.16 : 0.02,
    });
  const plane = new Mesh(geometry, material);
  plane.name = `authored-art-detail:${spec.region}`;
  plane.position.set(...spec.position);
  plane.rotation.x = spec.rotationX ?? 0;
  plane.rotation.y = spec.rotationY ?? 0;
  plane.castShadow = false;
  plane.receiveShadow = false;
  geometries.add(geometry);
  materials.add(material);
  parent.add(plane);
}

export function decorateVenueWithArtPack(set: DioramaSet, pack: LoadedVenueArtPack): VenueArtDecoration {
  const root = new Group();
  root.name = `venue-art:${pack.id}:curated-details`;
  const geometries = new Set<PlaneGeometry>();
  const materials = new Set<Material>();
  const decoratedMaterials = new Set<MeshStandardMaterial>();

  for (const [surfaceKind, entries] of set.surfaceMaterials) {
    const region = SURFACE_REGION[surfaceKind];
    const texture = firstTexture(pack, region ?? '', 'surface-wall', 'surface-floor');
    if (!texture) continue;
    for (const material of entries) {
      material.roughnessMap = texture;
      material.bumpMap = texture;
      material.bumpScale = surfaceKind === 'floor' ? 0.01 : surfaceKind === 'metal' ? 0.004 : 0.014;
      material.needsUpdate = true;
      decoratedMaterials.add(material);
    }
  }

  for (const spec of DETAIL_PLANES[pack.venue]) addDetailPlane(root, pack, spec, geometries, materials);
  set.root.add(root);
  let disposed = false;
  return {
    root,
    drawCalls: geometries.size,
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
