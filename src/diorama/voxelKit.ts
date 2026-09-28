import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix3,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three';

// Baukasten für Klötzchen-Modelle: farbige Quader werden zu einer Geometrie mit
// Vertexfarben zusammengefasst. Mit `VoxelRig` wird daraus ein Skelett-Modell, bei
// dem Knochen die Gelenke bewegen; eine ganze Figur ist dann ein einziger Zeichenaufruf.

export type Size = readonly [number, number, number];
export type Position = readonly [number, number, number];
type Rotation = Readonly<{ x?: number; y?: number; z?: number }>;

interface BoxSpec {
  readonly size: Size;
  readonly center: Position;
  readonly color: string;
  readonly rotation?: Rotation;
}

const FACES: readonly { normal: Position; corners: readonly Position[]; tint: number }[] = [
  { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], tint: 0.94 },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], tint: 0.94 },
  { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], tint: 1.06 },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], tint: 0.78 },
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], tint: 1 },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], tint: 0.9 },
];

export function shade(color: string, amount: number): string {
  const source = Number.parseInt(color.slice(1), 16);
  const channels = [source >> 16, (source >> 8) & 255, source & 255].map((channel) => Math.round(
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount),
  ));
  return `#${channels.map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(left: string, right: string, amount: number): string {
  const a = Number.parseInt(left.slice(1), 16);
  const b = Number.parseInt(right.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export class BoxBatch {
  readonly boxes: BoxSpec[] = [];

  /** Fügt einen Quader hinzu; `rotation` dreht ihn um seine eigene Mitte. */
  add(size: Size, center: Position, color: string, rotation?: Rotation): this {
    this.boxes.push({ size, center, color, rotation });
    return this;
  }

  get empty(): boolean {
    return this.boxes.length === 0;
  }

  build(): BufferGeometry {
    return buildGeometry([{ batch: this, matrix: new Matrix4(), bone: -1 }]);
  }
}

interface PlacedBatch {
  readonly batch: BoxBatch;
  /** Lage der Quader im Modell (für Skelett-Modelle: Ruhelage des Knochens). */
  readonly matrix: Matrix4;
  /** Knochen, der die Quader bewegt; −1 für starre Modelle. */
  readonly bone: number;
}

function buildGeometry(parts: readonly PlacedBatch[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const skinIndices: number[] = [];
  const indices: number[] = [];
  const skinned = parts.some((part) => part.bone >= 0);
  const color = new Color();
  const local = new Matrix4();
  const world = new Matrix4();
  const normalMatrix = new Matrix3();
  const vector = new Vector3();
  const normal = new Vector3();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();
  const center = new Vector3();
  for (const part of parts) {
    for (const box of part.batch.boxes) {
      color.set(box.color);
      quaternion.setFromEuler(euler.set(box.rotation?.x ?? 0, box.rotation?.y ?? 0, box.rotation?.z ?? 0));
      local.compose(center.set(...box.center), quaternion, scale.set(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2));
      world.multiplyMatrices(part.matrix, local);
      normalMatrix.getNormalMatrix(world);
      for (const face of FACES) {
        const base = positions.length / 3;
        normal.set(...face.normal).applyMatrix3(normalMatrix).normalize();
        for (const corner of face.corners) {
          vector.set(...corner).applyMatrix4(world);
          positions.push(vector.x, vector.y, vector.z);
          normals.push(normal.x, normal.y, normal.z);
          colors.push(color.r * face.tint, color.g * face.tint, color.b * face.tint);
          if (skinned) skinIndices.push(Math.max(0, part.bone), 0, 0, 0);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  if (skinned) {
    const weights = new Float32Array(skinIndices.length);
    for (let index = 0; index < weights.length; index += 4) weights[index] = 1;
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(skinIndices), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Sammelt Quader pro Knochen und baut daraus ein einziges Skelett-Modell.
 * Die Knochen bilden die Gelenkhierarchie; Quader werden in Knochen-Koordinaten angegeben.
 */
export class VoxelRig {
  private readonly parts: { readonly bone: Bone; readonly batch: BoxBatch }[] = [];

  attach(bone: Bone, batch: BoxBatch): void {
    this.parts.push({ bone, batch });
  }

  /** Baut das Modell in der aktuellen Haltung als Ruhelage und hängt es an `root`. */
  build(root: Object3D, material: Material): SkinnedMesh {
    root.updateMatrixWorld(true);
    const bones: Bone[] = [];
    root.traverse((object) => { if (object instanceof Bone) bones.push(object); });
    const indexOf = new Map(bones.map((bone, index) => [bone, index]));
    const rootInverse = root.matrixWorld.clone().invert();
    const geometry = buildGeometry(this.parts.map((part) => ({
      batch: part.batch,
      matrix: rootInverse.clone().multiply(part.bone.matrixWorld),
      bone: indexOf.get(part.bone) ?? 0,
    })));
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = `${root.name}:mesh`;
    // Gliedmaßen verlassen die Ruhelage; das Modell ist klein, Culling spart hier nichts.
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(new Skeleton(bones));
    return mesh;
  }
}
