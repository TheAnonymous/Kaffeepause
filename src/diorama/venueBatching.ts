import {
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import type {
  BatchedVenueResources,
  StaticPrimitiveKind,
  StaticPrimitiveSpec,
  VenueBatchKey,
} from './types';
import type { VenueKind } from '../venue';

/** Captured from the pre-V4 renderer with the same empty-welcome fixture. */
export const V3_VENUE_GEOMETRY_BASELINES: Readonly<Record<VenueKind, number>> = Object.freeze({
  cafe: 153,
  ramen: 138,
  arcade: 139,
});

interface BatchCandidate {
  readonly mesh: Mesh<BufferGeometry, Material>;
  readonly spec: StaticPrimitiveSpec;
  readonly batchParent: Object3D;
  readonly scope: string;
}

export function venueBatchKeyFor(spec: Omit<StaticPrimitiveSpec, 'matrix'>): VenueBatchKey {
  return [
    spec.kind,
    spec.geometryKey,
    spec.materialKey,
    spec.layerMask,
    Number(spec.castShadow),
    Number(spec.receiveShadow),
    spec.renderOrder,
    Number(spec.selectiveBloom),
  ].join('|');
}

function primitiveKind(object: Object3D): StaticPrimitiveKind | undefined {
  const kind = object.userData.staticPrimitiveKind;
  return kind === 'box' || kind === 'cylinder' || kind === 'plane' ? kind : undefined;
}

export function isStaticPrimitiveBatchable(object: Object3D, excluded: ReadonlySet<Object3D> = new Set()): boolean {
  if (!(object instanceof Mesh) || !primitiveKind(object) || object.userData.staticBatchable === false) return false;
  let ancestor: Object3D | null = object;
  while (ancestor) {
    if (excluded.has(ancestor) || ancestor.userData.staticBatchBoundary === true) return false;
    ancestor = ancestor.parent;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.length === 1
    && materials[0] instanceof MeshStandardMaterial
    && !materials[0].transparent
    && materials[0].opacity >= 1;
}

export function batchStaticVenuePrimitives(
  root: Object3D,
  excluded: ReadonlySet<Object3D>,
  unitGeometryCount: number,
  venue: VenueKind,
): BatchedVenueResources {
  root.updateMatrixWorld(true);
  const candidates: BatchCandidate[] = [];
  root.traverse((object) => {
    if (!isStaticPrimitiveBatchable(object, excluded)) return;
    const mesh = object as Mesh<BufferGeometry, Material>;
    const kind = primitiveKind(mesh);
    if (!kind) return;
    const material = mesh.material as Material;
    let batchParent = root;
    let ancestor = mesh.parent;
    while (ancestor && ancestor !== root) {
      if (typeof ancestor.userData.staticBatchScope === 'string') {
        batchParent = ancestor;
        break;
      }
      ancestor = ancestor.parent;
    }
    const parentInverse = new Matrix4().copy(batchParent.matrixWorld).invert();
    const scope = typeof batchParent.userData.staticBatchScope === 'string'
      ? batchParent.userData.staticBatchScope
      : 'venue';
    candidates.push({
      mesh,
      batchParent,
      scope,
      spec: {
        kind,
        geometryKey: String(mesh.geometry.userData.staticGeometryKey ?? mesh.geometry.uuid),
        materialKey: String(material.userData.sharedMaterialKey ?? material.uuid),
        layerMask: mesh.layers.mask,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        renderOrder: mesh.renderOrder,
        selectiveBloom: mesh.userData.selectiveBloom === true,
        matrix: new Matrix4().multiplyMatrices(parentInverse, mesh.matrixWorld),
      },
    });
  });

  const grouped = new Map<VenueBatchKey, BatchCandidate[]>();
  for (const candidate of candidates) {
    const key = `${venueBatchKeyFor(candidate.spec)}|${candidate.scope}`;
    const entries = grouped.get(key) ?? [];
    entries.push(candidate);
    grouped.set(key, entries);
  }

  const meshes: InstancedMesh<BufferGeometry, Material>[] = [];
  let primitiveCount = 0;
  for (const [key, entries] of grouped) {
    // A single primitive gains nothing from instancing and remains independently inspectable.
    if (entries.length < 2) continue;
    const first = entries[0];
    if (!first) continue;
    const batch = new InstancedMesh(first.mesh.geometry, first.mesh.material, entries.length);
    batch.name = `static-batch:${key}`;
    batch.layers.mask = first.spec.layerMask;
    batch.castShadow = first.spec.castShadow;
    batch.receiveShadow = first.spec.receiveShadow;
    batch.renderOrder = first.spec.renderOrder;
    batch.userData.staticBatch = true;
    batch.userData.staticPrimitiveCount = entries.length;
    if (first.spec.selectiveBloom) batch.userData.selectiveBloom = true;
    entries.forEach((entry, index) => {
      batch.setMatrixAt(index, entry.spec.matrix);
      entry.mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    first.batchParent.add(batch);
    meshes.push(batch);
    primitiveCount += entries.length;
  }

  return {
    meshes,
    primitiveCount,
    batchCount: meshes.length,
    sourceMeshCount: candidates.length,
    unitGeometryCount,
    v3GeometryBaseline: V3_VENUE_GEOMETRY_BASELINES[venue],
  };
}
