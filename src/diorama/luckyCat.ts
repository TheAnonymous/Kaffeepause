import { Bone, Group, MeshStandardMaterial, Vector3, type SkinnedMesh } from 'three';
import { BoxBatch, VoxelRig } from './voxelKit';

// Die Winkekatze auf der Ramen-Theke: Sie winkt immer gemächlich mit der erhobenen Pfote.
// Ein Klick bringt sie zum eifrigen Winken, dabei wackelt das Glöckchen am Halsband.

/** Wo sie auf der Theke steht (rechts, neben der Klingel). */
export const LUCKY_CAT_POSITION = { x: 3.72, y: 1.33, z: -1.98 } as const;
/** So lange winkt sie eifrig nach einem Klick (Sekunden). */
export const LUCKY_CAT_EAGER_SECONDS = 2.6;

const SCALE = 1.6;
const MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
const COLORS = {
  white: '#f4efe6', shade: '#ddd5c8', red: '#c8423b', gold: '#e7b84a', black: '#24201f', pink: '#e79aa0', orange: '#e0893a',
} as const;

/** Winkel der Pfote: gemächlich, nach einem Klick schnell und weit. */
export function luckyCatPawAngle(time: number, eagerSince: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const eager = time - eagerSince >= 0 && time - eagerSince < LUCKY_CAT_EAGER_SECONDS;
  return eager ? Math.sin(time * 15) * 0.75 : Math.sin(time * 2.2) * 0.35;
}

export class LuckyCat {
  readonly root = new Group();
  private readonly body = new Bone();
  private readonly paw = new Bone();
  private readonly bell = new Bone();
  private readonly rig = new VoxelRig();
  private readonly mesh: SkinnedMesh;
  private eagerSince = Number.NEGATIVE_INFINITY;
  private readonly clickPoint = new Vector3();

  constructor() {
    this.root.name = 'lucky-cat';
    this.root.position.set(LUCKY_CAT_POSITION.x, LUCKY_CAT_POSITION.y, LUCKY_CAT_POSITION.z);
    // Leicht zur Kamera und zur Raummitte gedreht, groß genug, dass man das Winken von weitem sieht.
    this.root.rotation.y = -0.35;
    this.root.scale.setScalar(SCALE);
    this.root.add(this.body);
    this.rig.attach(this.body, new BoxBatch()
      // Sockel, Körper mit Bäuchlein, Kopf mit Ohren
      .add([0.26, 0.04, 0.2], [0, 0.02, 0], COLORS.red)
      .add([0.22, 0.2, 0.17], [0, 0.14, 0], COLORS.white)
      .add([0.14, 0.12, 0.02], [0, 0.13, 0.086], COLORS.shade)
      .add([0.24, 0.18, 0.18], [0, 0.32, 0.01], COLORS.white)
      .add([0.06, 0.06, 0.04], [-0.08, 0.43, 0.0], COLORS.white)
      .add([0.06, 0.06, 0.04], [0.08, 0.43, 0.0], COLORS.white)
      .add([0.035, 0.035, 0.02], [-0.08, 0.43, 0.02], COLORS.pink)
      .add([0.035, 0.035, 0.02], [0.08, 0.43, 0.02], COLORS.pink)
      .add([0.06, 0.05, 0.03], [0.07, 0.36, 0.095], COLORS.orange)
      // Gesicht: geschlossene, lachende Augen, Nase, Schnurrhaare
      .add([0.05, 0.012, 0.01], [-0.055, 0.34, 0.1], COLORS.black)
      .add([0.05, 0.012, 0.01], [0.055, 0.34, 0.1], COLORS.black)
      .add([0.025, 0.02, 0.01], [0, 0.305, 0.102], COLORS.pink)
      .add([0.05, 0.006, 0.006], [-0.1, 0.3, 0.1], COLORS.black)
      .add([0.05, 0.006, 0.006], [0.1, 0.3, 0.1], COLORS.black)
      // Halsband und die Pfote, die den Glückstaler hält
      .add([0.23, 0.03, 0.18], [0, 0.235, 0.005], COLORS.red)
      .add([0.06, 0.08, 0.05], [-0.06, 0.12, 0.095], COLORS.white)
      .add([0.07, 0.06, 0.015], [-0.06, 0.12, 0.122], COLORS.gold));
    // Erhobene rechte Pfote; der Knochen sitzt an der Schulter.
    this.paw.position.set(0.12, 0.2, 0.02);
    this.body.add(this.paw);
    this.rig.attach(this.paw, new BoxBatch()
      .add([0.06, 0.16, 0.06], [0.01, 0.08, 0], COLORS.white)
      .add([0.065, 0.05, 0.065], [0.01, 0.17, 0.005], COLORS.white)
      .add([0.03, 0.02, 0.01], [0.01, 0.17, 0.04], COLORS.pink));
    this.bell.position.set(0, 0.215, 0.1);
    this.body.add(this.bell);
    this.rig.attach(this.bell, new BoxBatch().add([0.04, 0.04, 0.03], [0, -0.02, 0], COLORS.gold));
    this.mesh = this.rig.build(this.root, MATERIAL);
    this.root.updateMatrixWorld(true);
  }

  /** Punkt zum Anklicken (Kopf der Katze), in Weltkoordinaten. */
  get focusPoint(): Vector3 {
    return this.clickPoint.set(LUCKY_CAT_POSITION.x, LUCKY_CAT_POSITION.y + 0.3 * SCALE, LUCKY_CAT_POSITION.z);
  }

  /** Klick: Sie winkt eifrig. Gibt false zurück, wenn sie das gerade schon tut. */
  wave(time: number): boolean {
    if (time - this.eagerSince < LUCKY_CAT_EAGER_SECONDS) return false;
    this.eagerSince = time;
    return true;
  }

  update(time: number, reducedMotion: boolean): void {
    this.paw.rotation.x = -luckyCatPawAngle(time, this.eagerSince, reducedMotion);
    const eager = !reducedMotion && time - this.eagerSince < LUCKY_CAT_EAGER_SECONDS;
    this.bell.rotation.z = eager ? Math.sin(time * 22) * 0.5 : 0;
    this.body.rotation.z = eager ? Math.sin(time * 15) * 0.03 : 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
