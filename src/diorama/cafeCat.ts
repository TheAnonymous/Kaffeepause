import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { applyOneTexelSilhouette, SPRITE_ROWS_PER_UNIT } from './spriteFactory';

// Mochi, die Café-Katze: schläft auf der Fensterbank, schaut nach dem Kuchen,
// putzt sich und schlendert zurück. Läuft rein im Renderer und stört keine Gäste.

type CatPose = 'sleep' | 'sit' | 'groom' | 'walk-a' | 'walk-b';

const WIDTH = 48;
const HEIGHT = 32;
const LOOP_SECONDS = 150;
// Etwas größer als maßstäblich, damit man Mochi auch in der Totalen entdeckt.
const CAT_SCALE = 1.4;
const COLORS = {
  base: '#e08a3c', dark: '#b0602a', light: '#f4b36b', white: '#f3e8d8', eye: '#2b2f1f', nose: '#d97a7a',
} as const;

interface Point3 { readonly x: number; readonly y: number; readonly z: number }

const BENCH: Point3 = { x: -5.2, y: 0.67, z: -1.72 };
const BENCH_FLOOR: Point3 = { x: -5.0, y: 0.08, z: -1.0 };
const CAKE_CASE: Point3 = { x: 2.1, y: 0.08, z: -0.95 };

interface CatState {
  readonly pose: CatPose;
  readonly position: Point3;
  readonly facing: -1 | 1;
}

function px(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function ears(context: CanvasRenderingContext2D, x: number, y: number): void {
  px(context, COLORS.dark, x, y, 3, 3);
  px(context, COLORS.dark, x + 8, y, 3, 3);
  px(context, COLORS.nose, x + 1, y + 1, 1, 2);
  px(context, COLORS.nose, x + 9, y + 1, 1, 2);
}

function drawCat(context: CanvasRenderingContext2D, pose: CatPose): void {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  if (pose === 'sleep') {
    // Zusammengerollt: runder Körper, Kopf auf den Pfoten, Schwanz vorn herum.
    px(context, COLORS.base, 10, 21, 28, 10);
    px(context, COLORS.light, 13, 21, 18, 3);
    for (const x of [15, 21, 27]) px(context, COLORS.dark, x, 22, 2, 6);
    px(context, COLORS.base, 30, 18, 12, 11);
    ears(context, 30, 15);
    px(context, COLORS.eye, 33, 23, 3, 1);
    px(context, COLORS.eye, 38, 23, 3, 1);
    px(context, COLORS.nose, 40, 26, 2, 1);
    px(context, COLORS.dark, 8, 28, 26, 3);
    px(context, COLORS.white, 34, 29, 7, 2);
    return;
  }
  if (pose === 'walk-a' || pose === 'walk-b') {
    const step = pose === 'walk-a' ? 0 : 2;
    px(context, COLORS.base, 10, 15, 26, 9);
    px(context, COLORS.light, 12, 15, 20, 2);
    for (const x of [16, 22, 28]) px(context, COLORS.dark, x, 16, 2, 6);
    for (const [x, offset] of [[11, step], [16, -step], [28, -step], [33, step]] as const) {
      px(context, COLORS.base, x + offset, 24, 3, 6);
      px(context, COLORS.white, x + offset, 29, 3, 2);
    }
    px(context, COLORS.base, 33, 8, 11, 10);
    ears(context, 33, 5);
    px(context, COLORS.eye, 36, 11, 2, 2);
    px(context, COLORS.eye, 41, 11, 2, 2);
    px(context, COLORS.nose, 42, 14, 2, 1);
    px(context, COLORS.dark, 6, 8 + step, 3, 9);
    px(context, COLORS.dark, 4, 6 + step, 3, 3);
    return;
  }
  // Sitzen und Putzen: aufrecht, Schwanz um die Pfoten gelegt.
  px(context, COLORS.base, 18, 13, 15, 17);
  px(context, COLORS.white, 22, 17, 7, 9);
  for (const y of [15, 21]) px(context, COLORS.dark, 18, y, 3, 2);
  px(context, COLORS.white, 19, 28, 5, 3);
  px(context, COLORS.white, 27, 28, 5, 3);
  px(context, COLORS.dark, 9, 27, 12, 3);
  px(context, COLORS.dark, 8, 24, 3, 4);
  px(context, COLORS.base, 19, 2, 13, 12);
  ears(context, 20, -1);
  if (pose === 'groom') {
    px(context, COLORS.eye, 22, 7, 3, 1);
    px(context, COLORS.eye, 27, 7, 3, 1);
    px(context, COLORS.white, 28, 9, 4, 6);
  } else {
    px(context, COLORS.eye, 22, 6, 2, 3);
    px(context, COLORS.eye, 27, 6, 2, 3);
  }
  px(context, COLORS.nose, 25, 10, 2, 1);
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
  const walk = (Math.floor(time * 4) % 2 === 0 ? 'walk-a' : 'walk-b') as CatPose;
  if (t < 80) return { pose: 'sleep', position: BENCH, facing: 1 };
  if (t < 84) return { pose: 'sit', position: BENCH, facing: 1 };
  if (t < 84.6) return { pose: 'walk-a', position: lerp(BENCH, BENCH_FLOOR, (t - 84) / 0.6, 0.35), facing: 1 };
  if (t < 96) return { pose: walk, position: lerp(BENCH_FLOOR, CAKE_CASE, (t - 84.6) / 11.4), facing: 1 };
  if (t < 118) return { pose: 'sit', position: CAKE_CASE, facing: 1 };
  if (t < 126) return { pose: 'groom', position: CAKE_CASE, facing: 1 };
  if (t < 137.4) return { pose: walk, position: lerp(CAKE_CASE, BENCH_FLOOR, (t - 126) / 11.4), facing: -1 };
  if (t < 138) return { pose: 'walk-a', position: lerp(BENCH_FLOOR, BENCH, (t - 137.4) / 0.6, 0.35), facing: -1 };
  if (t < 144) return { pose: 'sit', position: BENCH, facing: 1 };
  return { pose: 'sleep', position: BENCH, facing: 1 };
}

export class CafeCat {
  readonly root = new Group();
  private readonly plane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly textures = new Map<CatPose, CanvasTexture>();
  private awakeUntil = -1;
  private readonly screenPoint = new Vector3();

  constructor() {
    this.root.name = 'cafe-cat';
    for (const pose of ['sleep', 'sit', 'groom', 'walk-a', 'walk-b'] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
      if (!context) throw new Error('Die Katze kann nicht gezeichnet werden.');
      drawCat(context, pose);
      applyOneTexelSilhouette(context, 'cafe');
      const texture = new CanvasTexture(canvas);
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = false;
      this.textures.set(pose, texture);
    }
    this.plane = new Mesh(
      new PlaneGeometry(WIDTH / SPRITE_ROWS_PER_UNIT * CAT_SCALE, HEIGHT / SPRITE_ROWS_PER_UNIT * CAT_SCALE),
      new MeshStandardMaterial({ color: '#ffffff', transparent: true, alphaTest: 0.04, roughness: 0.85, side: DoubleSide }),
    );
    this.plane.position.y = HEIGHT / SPRITE_ROWS_PER_UNIT * CAT_SCALE / 2;
    this.root.add(this.plane);
  }

  /** Gibt zurück, ob Mochi gerade gestreichelt wird (Maus liegt auf ihr). */
  update(time: number, reducedMotion: boolean, billboardYaw: number, isNear: (point: Vector3) => boolean): boolean {
    let state = catStateAt(time, reducedMotion);
    this.screenPoint.set(state.position.x, state.position.y + 0.18, state.position.z);
    const petted = isNear(this.screenPoint);
    if (petted) this.awakeUntil = time + 4;
    if (time < this.awakeUntil && state.pose === 'sleep') state = { ...state, pose: 'sit' };
    const texture = this.textures.get(state.pose);
    if (texture && this.plane.material.map !== texture) {
      this.plane.material.map = texture;
      this.plane.material.needsUpdate = true;
    }
    this.root.position.set(state.position.x, state.position.y, state.position.z);
    this.plane.rotation.set(0, billboardYaw, 0);
    this.plane.scale.x = state.facing;
    return petted;
  }

  dispose(): void {
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
