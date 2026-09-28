import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Baukasten für Klötzchen-Modelle: viele farbige Quader werden zu einer einzigen
// Geometrie mit Vertexfarben zusammengefasst. Eine Figur braucht so nur wenige Draw Calls.

export type Size = readonly [number, number, number];
export type Position = readonly [number, number, number];

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
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly color = new Color();
  private readonly matrix = new Matrix4();
  private readonly rotation = new Matrix4();
  private readonly vector = new Vector3();
  private readonly normal = new Vector3();

  /** Fügt einen Quader hinzu; `rotation` dreht ihn um seine eigene Mitte. */
  add(size: Size, center: Position, hex: string, rotation?: Readonly<{ x?: number; y?: number; z?: number }>): this {
    this.color.set(hex);
    const quaternion = new Quaternion().setFromEuler(new Euler(rotation?.x ?? 0, rotation?.y ?? 0, rotation?.z ?? 0));
    this.rotation.makeRotationFromQuaternion(quaternion);
    this.matrix.compose(new Vector3(...center), quaternion, new Vector3(size[0] / 2, size[1] / 2, size[2] / 2));
    for (const face of FACES) {
      const base = this.positions.length / 3;
      this.normal.set(...face.normal).applyMatrix4(this.rotation).normalize();
      for (const corner of face.corners) {
        this.vector.set(...corner).applyMatrix4(this.matrix);
        this.positions.push(this.vector.x, this.vector.y, this.vector.z);
        this.normals.push(this.normal.x, this.normal.y, this.normal.z);
        this.colors.push(this.color.r * face.tint, this.color.g * face.tint, this.color.b * face.tint);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  get empty(): boolean {
    return this.positions.length === 0;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
