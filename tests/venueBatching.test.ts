import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildVenue } from '../src/diorama/venueBuilder';
import {
  batchStaticVenuePrimitives,
  isStaticPrimitiveBatchable,
  venueBatchKeyFor,
} from '../src/diorama/venueBatching';

function primitive(material = new MeshStandardMaterial()): Mesh<BoxGeometry, MeshStandardMaterial> {
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.userData.staticGeometryKey = 'box:unit';
  const mesh = new Mesh(geometry, material);
  mesh.userData.staticPrimitiveKind = 'box';
  return mesh;
}

describe('statische Venue-Batches', () => {
  it('bildet den Batchschlüssel aus Primitive, Material, Layer und Schattenverhalten', () => {
    const base = {
      kind: 'box' as const,
      geometryKey: 'box:unit', materialKey: 'wood', layerMask: 1,
      castShadow: true, receiveShadow: true, renderOrder: 0, selectiveBloom: false,
    };
    expect(venueBatchKeyFor(base)).not.toBe(venueBatchKeyFor({ ...base, layerMask: 2 }));
    expect(venueBatchKeyFor(base)).not.toBe(venueBatchKeyFor({ ...base, castShadow: false }));
    expect(venueBatchKeyFor(base)).toBe(venueBatchKeyFor({ ...base }));
  });

  it('übernimmt die geprüften Welttransformationen in Instanzmatrizen', () => {
    const root = new Group();
    const material = new MeshStandardMaterial();
    material.userData.sharedMaterialKey = 'wood';
    const first = primitive(material);
    first.position.set(2, 3, 4);
    first.scale.set(2, 1, 3);
    const second = primitive(material);
    second.position.set(-2, 1, 0);
    root.add(first, second);
    const resources = batchStaticVenuePrimitives(root, new Set(), 1, 'cafe');
    expect(resources).toMatchObject({ batchCount: 1, primitiveCount: 2, sourceMeshCount: 2 });
    const batch = resources.meshes[0];
    expect(batch).toBeInstanceOf(InstancedMesh);
    const matrix = new Matrix4();
    const position = new Vector3();
    batch?.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.toArray()).toEqual([2, 3, 4]);
  });

  it('lässt transparente, animierbare und Fokusobjekte separat', () => {
    const transparent = primitive(new MeshStandardMaterial({ transparent: true, opacity: 0.5 }));
    const focusedParent = new Group();
    focusedParent.userData.staticBatchBoundary = true;
    const focused = primitive();
    focusedParent.add(focused);
    expect(isStaticPrimitiveBatchable(transparent)).toBe(false);
    expect(isStaticPrimitiveBatchable(focused)).toBe(false);
  });

  it.each(['cafe', 'ramen', 'arcade'] as const)('bündelt %s und hält Fokusmöbel als Einzelobjekte', (venue) => {
    const set = buildVenue(venue);
    expect(set.batchedResources.batchCount).toBeGreaterThan(0);
    expect(set.batchedResources.primitiveCount).toBeGreaterThan(set.batchedResources.batchCount);
    expect(set.batchedResources.unitGeometryCount).toBeLessThanOrEqual(7);
    expect(set.batchedResources.unitGeometryCount)
      .toBeLessThanOrEqual(set.batchedResources.v3GeometryBaseline * 0.6);
    for (const occluder of set.focusOccluders) expect(occluder.object.parent).not.toBeNull();
    let disposedBatches = 0;
    for (const batch of set.batchedResources.meshes) batch.addEventListener('dispose', () => { disposedBatches += 1; });
    set.dispose();
    expect(disposedBatches).toBe(set.batchedResources.batchCount);
  });
});
