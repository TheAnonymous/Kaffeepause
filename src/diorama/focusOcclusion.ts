import { Raycaster, Vector3 } from 'three';
import type { FocusOccluder } from './types';

export const FOCUS_OCCLUDER_MINIMUM_OPACITY = 0.48;

export interface FocusVisibilityTarget {
  readonly id: string;
  readonly position: Readonly<Vector3>;
  readonly height: number;
  readonly width: number;
}

/** Samples face, both shoulders and both hands instead of fading broad scene regions. */
export function focusVisibilityPoints(target: Readonly<FocusVisibilityTarget>): readonly Vector3[] {
  const { position, height, width } = target;
  return [
    new Vector3(position.x, position.y + height * 0.84, position.z),
    new Vector3(position.x - width * 0.24, position.y + height * 0.68, position.z),
    new Vector3(position.x + width * 0.24, position.y + height * 0.68, position.z),
    new Vector3(position.x - width * 0.34, position.y + height * 0.48, position.z),
    new Vector3(position.x + width * 0.34, position.y + height * 0.48, position.z),
  ];
}

export function selectFocusOccluders(
  cameraPosition: Readonly<Vector3>,
  targets: readonly Readonly<FocusVisibilityTarget>[],
  occluders: readonly FocusOccluder[],
): readonly FocusOccluder[] {
  if (targets.length === 0 || occluders.length === 0) return [];
  const raycaster = new Raycaster();
  const selected = new Set<FocusOccluder>();
  for (const point of targets.flatMap(focusVisibilityPoints)) {
    const direction = point.clone().sub(cameraPosition);
    const targetDistance = direction.length();
    if (targetDistance <= 0.05) continue;
    direction.normalize();
    raycaster.set(cameraPosition, direction);
    raycaster.far = targetDistance - 0.05;
    for (const occluder of occluders) {
      if (selected.has(occluder)) continue;
      occluder.object.updateWorldMatrix(true, true);
      if (raycaster.intersectObject(occluder.object, true).length > 0) selected.add(occluder);
    }
  }
  return [...selected];
}

export function focusOccluderOpacity(amount: number): number {
  const eased = Math.max(0, Math.min(1, amount));
  return 1 - (1 - FOCUS_OCCLUDER_MINIMUM_OPACITY) * eased;
}

export function fadeFocusOccluder(occluder: Readonly<FocusOccluder>, amount: number): void {
  const multiplier = focusOccluderOpacity(amount);
  for (const state of occluder.materials) {
    state.material.transparent = true;
    state.material.depthWrite = false;
    state.material.opacity = state.opacity * multiplier;
    state.material.needsUpdate = true;
  }
}

export function restoreFocusOccluder(occluder: Readonly<FocusOccluder>): void {
  for (const state of occluder.materials) {
    state.material.opacity = state.opacity;
    state.material.transparent = state.transparent;
    state.material.depthWrite = state.depthWrite;
    state.material.needsUpdate = true;
  }
}

export function restoreFocusOccluders(occluders: readonly FocusOccluder[]): void {
  for (const occluder of occluders) restoreFocusOccluder(occluder);
}
