import { Group, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three';
import { BoxBatch } from './voxelKit';

// Mochi, die Café-Katze aus Klötzchen: schläft auf der Fensterbank, schaut nach dem
// Kuchen, putzt sich und schlendert zurück. Läuft rein im Renderer und stört keine Gäste.

type CatPose = 'sleep' | 'sit' | 'groom' | 'walk';

const LOOP_SECONDS = 150;
const MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
const COLORS = { base: '#e08a3c', dark: '#b0602a', light: '#f4b36b', white: '#f3e8d8', eye: '#6fae4a', pupil: '#1d2418', nose: '#d97a7a' } as const;

interface Point3 { readonly x: number; readonly y: number; readonly z: number }

const BENCH: Point3 = { x: -5.2, y: 0.67, z: -1.72 };
const BENCH_FLOOR: Point3 = { x: -5.0, y: 0.08, z: -1.0 };
const CAKE_CASE: Point3 = { x: 2.1, y: 0.08, z: -0.95 };

interface CatState {
  readonly pose: CatPose;
  readonly position: Point3;
  readonly facing: -1 | 1;
}

function lerp(from: Point3, to: Point3, progress: number, hop = 0): Point3 {
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * hop,
    z: from.z + (to.z - from.z) * t,
  };
}

/** Ablauf über 150 Sekunden; beim Betreten schläft Mochi. */
export function catStateAt(time: number, reducedMotion = false): CatState {
  if (reducedMotion) return { pose: 'sleep', position: BENCH, facing: 1 };
  const t = ((time % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  if (t < 80) return { pose: 'sleep', position: BENCH, facing: 1 };
  if (t < 84) return { pose: 'sit', position: BENCH, facing: 1 };
  if (t < 84.6) return { pose: 'walk', position: lerp(BENCH, BENCH_FLOOR, (t - 84) / 0.6, 0.35), facing: 1 };
  if (t < 96) return { pose: 'walk', position: lerp(BENCH_FLOOR, CAKE_CASE, (t - 84.6) / 11.4), facing: 1 };
  if (t < 118) return { pose: 'sit', position: CAKE_CASE, facing: 1 };
  if (t < 126) return { pose: 'groom', position: CAKE_CASE, facing: 1 };
  if (t < 137.4) return { pose: 'walk', position: lerp(CAKE_CASE, BENCH_FLOOR, (t - 126) / 11.4), facing: -1 };
  if (t < 138) return { pose: 'walk', position: lerp(BENCH_FLOOR, BENCH, (t - 137.4) / 0.6, 0.35), facing: -1 };
  if (t < 144) return { pose: 'sit', position: BENCH, facing: 1 };
  return { pose: 'sleep', position: BENCH, facing: 1 };
}

export class CafeCat {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly tail = new Group();
  private readonly legs: Group[] = [];
  private readonly eyesOpen: Mesh;
  private readonly eyesClosed: Mesh;
  private readonly geometries: BufferGeometry[] = [];
  private awakeUntil = -1;
  private readonly screenPoint = new Vector3();

  constructor() {
    this.root.name = 'cafe-cat';
    this.root.scale.setScalar(1.3);
    this.root.add(this.body);
    this.body.position.y = 0.16;
    this.part(this.body, new BoxBatch()
      .add([0.2, 0.18, 0.46], [0, 0.02, 0], COLORS.base)
      .add([0.21, 0.04, 0.06], [0, 0.07, -0.12], COLORS.dark)
      .add([0.21, 0.04, 0.06], [0, 0.07, 0.02], COLORS.dark)
      .add([0.21, 0.04, 0.06], [0, 0.07, 0.15], COLORS.dark)
      .add([0.16, 0.08, 0.3], [0, -0.06, 0.02], COLORS.white));
    for (const [x, z] of [[-0.06, 0.16], [0.06, 0.16], [-0.06, -0.16], [0.06, -0.16]] as const) {
      const leg = new Group();
      leg.position.set(x, -0.04, z);
      this.body.add(leg);
      this.part(leg, new BoxBatch().add([0.06, 0.14, 0.06], [0, -0.07, 0], COLORS.base).add([0.065, 0.035, 0.07], [0, -0.13, 0.005], COLORS.white));
      this.legs.push(leg);
    }
    this.head.position.set(0, 0.1, 0.24);
    this.body.add(this.head);
    this.part(this.head, new BoxBatch()
      .add([0.2, 0.17, 0.16], [0, 0.04, 0.02], COLORS.base)
      .add([0.1, 0.06, 0.04], [0, 0.0, 0.11], COLORS.white)
      .add([0.03, 0.02, 0.02], [0, 0.03, 0.135], COLORS.nose)
      .add([0.05, 0.06, 0.04], [-0.065, 0.15, 0.01], COLORS.dark)
      .add([0.05, 0.06, 0.04], [0.065, 0.15, 0.01], COLORS.dark)
      .add([0.13, 0.03, 0.02], [0, 0.1, 0.1], COLORS.dark));
    const open = new BoxBatch();
    const closed = new BoxBatch();
    for (const side of [-1, 1]) {
      open.add([0.04, 0.04, 0.01], [side * 0.05, 0.06, 0.105], COLORS.eye).add([0.015, 0.035, 0.012], [side * 0.05, 0.06, 0.107], COLORS.pupil);
      closed.add([0.045, 0.012, 0.01], [side * 0.05, 0.055, 0.105], COLORS.pupil);
    }
    this.eyesOpen = this.part(this.head, open);
    this.eyesClosed = this.part(this.head, closed);
    this.tail.position.set(0, 0.06, -0.23);
    this.body.add(this.tail);
    this.part(this.tail, new BoxBatch()
      .add([0.05, 0.05, 0.2], [0, 0, -0.1], COLORS.base)
      .add([0.052, 0.052, 0.14], [0, 0, -0.26], COLORS.dark));
    this.root.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  /** Gibt zurück, ob Mochi gerade gestreichelt wird (Maus liegt auf ihr). */
  update(time: number, reducedMotion: boolean, isNear: (point: Vector3) => boolean): boolean {
    let state = catStateAt(time, reducedMotion);
    this.screenPoint.set(state.position.x, state.position.y + 0.25, state.position.z);
    const petted = isNear(this.screenPoint);
    if (petted) this.awakeUntil = time + 4;
    if (time < this.awakeUntil && state.pose === 'sleep') state = { ...state, pose: 'sit' };

    this.root.position.set(state.position.x, state.position.y, state.position.z);
    this.root.rotation.y = state.facing * Math.PI / 2;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0.16;
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(0, 0, 0);
    for (const leg of this.legs) leg.rotation.set(0, 0, 0);
    this.eyesOpen.visible = true;
    this.eyesClosed.visible = false;
    const breath = Math.sin(time * 1.6) * 0.01;

    if (state.pose === 'sleep') {
      // Zusammengerollt: Beine eingezogen, Kopf auf den Pfoten, Schwanz um den Körper.
      this.body.position.y = 0.07 + breath;
      for (const leg of this.legs) leg.rotation.x = Math.PI / 2;
      this.head.rotation.set(0.35, -0.5, 0);
      this.tail.rotation.set(0.1, 2.3, 0);
      this.eyesOpen.visible = false;
      this.eyesClosed.visible = true;
    } else if (state.pose === 'walk') {
      const step = Math.sin(time * 10);
      const [frontLeft, frontRight, backLeft, backRight] = this.legs;
      if (frontLeft && frontRight && backLeft && backRight) {
        frontLeft.rotation.x = step * 0.5;
        backRight.rotation.x = step * 0.5;
        frontRight.rotation.x = -step * 0.5;
        backLeft.rotation.x = -step * 0.5;
      }
      this.body.position.y = 0.16 + Math.abs(step) * 0.015;
      this.tail.rotation.set(-0.9 + Math.sin(time * 3) * 0.15, 0, 0);
    } else {
      // Sitzen: Hinterteil auf dem Boden, Vorderbeine gestreckt, Schwanz um die Pfoten.
      this.body.rotation.x = -0.55;
      this.body.position.y = 0.2;
      const [, , backLeft, backRight] = this.legs;
      if (backLeft && backRight) {
        backLeft.rotation.x = 1.2;
        backRight.rotation.x = 1.2;
      }
      this.head.rotation.x = 0.5;
      this.tail.rotation.set(0.9, 0.9 + Math.sin(time * 1.5) * 0.2, 0);
      if (state.pose === 'groom') {
        const paw = this.legs[1];
        if (paw) paw.rotation.x = -1.6 + Math.sin(time * 6) * 0.2;
        this.head.rotation.set(0.9, -0.3, 0);
        this.eyesOpen.visible = false;
        this.eyesClosed.visible = true;
      }
    }
    return petted;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
  }

  private part(parent: Group, batch: BoxBatch): Mesh {
    const geometry = batch.build();
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, MATERIAL);
    parent.add(mesh);
    return mesh;
  }
}
