import { Bone, Group, MeshStandardMaterial, Vector3, type SkinnedMesh } from 'three';
import { BoxBatch, VoxelRig } from './voxelKit';

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
  /** Blickrichtung zur Kamera statt zur Seite (beim Besuch). */
  readonly towardViewer?: boolean;
}

/** Wie lange ein Besuch nach einem Klick dauert: runterhüpfen, sitzen und schnurren, zurück. */
export const CAT_VISIT_SECONDS = 9.2;

/**
 * Besuch nach einem Klick: Von der Fensterbank hüpft Mochi auf den Boden davor, sonst
 * dreht sie sich an Ort und Stelle zur Kamera. Danach geht es genau dort weiter, wo sie war.
 */
export function catVisitState(from: CatState, elapsed: number): CatState {
  const onBench = from.position.y > 0.3;
  const spot: Point3 = onBench ? { x: from.position.x, y: 0.08, z: -0.85 } : from.position;
  if (onBench && elapsed < 0.6) return { pose: 'walk', position: lerp(from.position, spot, elapsed / 0.6, 0.35), facing: 1, towardViewer: true };
  if (elapsed < CAT_VISIT_SECONDS - 0.6) return { pose: 'sit', position: spot, facing: 1, towardViewer: true };
  if (onBench) {
    return { pose: 'walk', position: lerp(spot, from.position, (elapsed - (CAT_VISIT_SECONDS - 0.6)) / 0.6, 0.35), facing: -1, towardViewer: true };
  }
  return { pose: 'sit', position: spot, facing: from.facing, towardViewer: true };
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
  private readonly body = new Bone();
  private readonly head = new Bone();
  private readonly tail = new Bone();
  private readonly legs: Bone[] = [];
  private readonly eyesOpen = new Bone();
  private readonly eyesClosed = new Bone();
  private readonly rig = new VoxelRig();
  private readonly mesh: SkinnedMesh;
  private readonly heart = new Bone();
  private awakeUntil = -1;
  private visitStart?: number;
  private visitFrom?: CatState;
  /** Summe aller Besuche; der normale Tagesablauf pausiert währenddessen. */
  private visitedSeconds = 0;
  private readonly screenPoint = new Vector3();

  constructor() {
    this.root.name = 'cafe-cat';
    this.root.scale.setScalar(1.3);
    this.root.add(this.body);
    this.body.position.y = 0.16;
    this.rig.attach(this.body, new BoxBatch()
      .add([0.2, 0.18, 0.46], [0, 0.02, 0], COLORS.base)
      .add([0.21, 0.04, 0.06], [0, 0.07, -0.12], COLORS.dark)
      .add([0.21, 0.04, 0.06], [0, 0.07, 0.02], COLORS.dark)
      .add([0.21, 0.04, 0.06], [0, 0.07, 0.15], COLORS.dark)
      .add([0.16, 0.08, 0.3], [0, -0.06, 0.02], COLORS.white));
    for (const [x, z] of [[-0.06, 0.16], [0.06, 0.16], [-0.06, -0.16], [0.06, -0.16]] as const) {
      const leg = new Bone();
      leg.position.set(x, -0.04, z);
      this.body.add(leg);
      this.rig.attach(leg, new BoxBatch().add([0.06, 0.14, 0.06], [0, -0.07, 0], COLORS.base).add([0.065, 0.035, 0.07], [0, -0.13, 0.005], COLORS.white));
      this.legs.push(leg);
    }
    this.head.position.set(0, 0.1, 0.24);
    this.body.add(this.head);
    this.rig.attach(this.head, new BoxBatch()
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
    this.head.add(this.eyesOpen, this.eyesClosed);
    this.rig.attach(this.eyesOpen, open);
    this.rig.attach(this.eyesClosed, closed);
    this.tail.position.set(0, 0.06, -0.23);
    this.body.add(this.tail);
    this.rig.attach(this.tail, new BoxBatch()
      .add([0.05, 0.05, 0.2], [0, 0, -0.1], COLORS.base)
      .add([0.052, 0.052, 0.14], [0, 0, -0.26], COLORS.dark));
    // Kleines Herz über Mochi, wenn sie gestreichelt wird oder zu Besuch ist.
    this.heart.position.set(0, 0.62, 0.18);
    this.root.add(this.heart);
    this.rig.attach(this.heart, new BoxBatch()
      .add([0.05, 0.05, 0.03], [-0.03, 0.02, 0], '#e85d7a')
      .add([0.05, 0.05, 0.03], [0.03, 0.02, 0], '#e85d7a')
      .add([0.07, 0.04, 0.03], [0, -0.015, 0], '#e85d7a')
      .add([0.03, 0.03, 0.03], [0, -0.045, 0], '#e85d7a')
      .add([0.02, 0.02, 0.032], [-0.035, 0.03, 0], '#ffb3c4'));
    this.mesh = this.rig.build(this.root, MATERIAL);
    this.heart.scale.setScalar(0);
  }

  /** Klick auf Mochi: Sie kommt zu dir. Gibt false zurück, wenn sie schon unterwegs ist. */
  summon(time: number, reducedMotion: boolean): boolean {
    if (this.visitStart !== undefined) return false;
    this.visitFrom = catStateAt(time - this.visitedSeconds, reducedMotion);
    this.visitStart = time;
    return true;
  }

  /** Punkt über Mochis Kopf für Klick und Mausnähe. */
  get focusPoint(): Vector3 {
    return this.screenPoint;
  }

  /** Gibt zurück, ob Mochi gerade gestreichelt wird (Maus liegt auf ihr). */
  update(time: number, reducedMotion: boolean, isNear: (point: Vector3) => boolean): boolean {
    let visiting = false;
    let state: CatState;
    if (this.visitStart !== undefined && this.visitFrom && time - this.visitStart < CAT_VISIT_SECONDS) {
      state = catVisitState(this.visitFrom, Math.max(0, time - this.visitStart));
      visiting = true;
    } else {
      if (this.visitStart !== undefined) {
        this.visitedSeconds += CAT_VISIT_SECONDS;
        this.visitStart = undefined;
        this.visitFrom = undefined;
      }
      state = catStateAt(time - this.visitedSeconds, reducedMotion);
    }
    this.screenPoint.set(state.position.x, state.position.y + 0.25, state.position.z);
    const petted = isNear(this.screenPoint);
    if (petted) this.awakeUntil = time + 4;
    if (time < this.awakeUntil && state.pose === 'sleep') state = { ...state, pose: 'sit' };

    this.root.position.set(state.position.x, state.position.y, state.position.z);
    this.root.rotation.y = state.towardViewer && state.pose !== 'walk' ? 0 : state.facing * Math.PI / 2;
    const hearts = visiting ? state.pose === 'sit' : petted;
    this.heart.scale.setScalar(hearts ? 1 : 0);
    this.heart.position.y = 0.62 + (reducedMotion ? 0 : Math.sin(time * 3) * 0.03);
    // Das Herz schaut immer zur Kamera, auch wenn Mochi seitlich sitzt.
    this.heart.rotation.y = -this.root.rotation.y;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0.16;
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(0, 0, 0);
    for (const leg of this.legs) leg.rotation.set(0, 0, 0);
    this.showEyes(true);
    const breath = Math.sin(time * 1.6) * 0.01;

    if (state.pose === 'sleep') {
      // Zusammengerollt: Beine eingezogen, Kopf auf den Pfoten, Schwanz um den Körper.
      this.body.position.y = 0.07 + breath;
      for (const leg of this.legs) leg.rotation.x = Math.PI / 2;
      this.head.rotation.set(0.35, -0.5, 0);
      this.tail.rotation.set(0.1, 2.3, 0);
      this.showEyes(false);
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
        this.showEyes(false);
      }
    }
    return petted;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }

  private showEyes(open: boolean): void {
    this.eyesOpen.scale.setScalar(open ? 1 : 0);
    this.eyesClosed.scale.setScalar(open ? 0 : 1);
  }
}
