import type { Object3D } from 'three';

export const SELECTIVE_BLOOM_LAYER = 1;

export function registerSelectiveBloomSurface(object: Object3D): void {
  object.layers.enable(SELECTIVE_BLOOM_LAYER);
  object.userData.selectiveBloom = true;
}

export function isSelectiveBloomSurface(object: Object3D): boolean {
  return object.layers.isEnabled(SELECTIVE_BLOOM_LAYER) && object.userData.selectiveBloom === true;
}

export function countSelectiveBloomSurfaces(root: Object3D): number {
  let count = 0;
  root.traverse((entry) => { if (isSelectiveBloomSurface(entry)) count += 1; });
  return count;
}
