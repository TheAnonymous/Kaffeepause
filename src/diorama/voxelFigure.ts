import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import type { GuestAppearance, GuestPalette } from '../simulation/types';
import type { CharacterVisualState, SeatView } from './characterVisualState';

// Probe: Figuren aus Klötzchen im Stil der Möbel. Echte Tiefe, echtes Hinsetzen
// und Umdrehen. Nur im Entwicklungsserver über `?figures=voxel` aktiv.

const UNIT_BOX = new BoxGeometry(1, 1, 1);

const THIGH = 0.26;
const SHIN = 0.26;
const SHOE = 0.1;
const HIP_HEIGHT = THIGH + SHIN + SHOE;
const TORSO = 0.62;
const HEAD = 0.58;

interface Limb {
  readonly pivot: Group;
  readonly lower?: Group;
}

function shade(color: string, amount: number): string {
  const source = Number.parseInt(color.slice(1), 16);
  const channels = [source >> 16, (source >> 8) & 255, source & 255].map((channel) => Math.round(
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount),
  ));
  return `#${channels.map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0')).join('')}`;
}

export interface VoxelPoseInput {
  readonly visual: CharacterVisualState;
  readonly seatView?: SeatView;
  /** Blickrichtung in der Ebene (Diorama-x/z), wenn die Figur läuft oder wartet. */
  readonly heading?: { readonly x: number; readonly z: number };
  readonly seatHeight: number;
  readonly time: number;
}

export class VoxelFigure {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly leftLeg: Limb;
  private readonly rightLeg: Limb;
  private readonly leftArm: Limb;
  private readonly rightArm: Limb;
  private readonly prop = new Group();
  private propKind = '';

  constructor(private readonly palette: GuestPalette, private readonly appearance: GuestAppearance, barista = false) {
    this.root.name = 'voxel-figure';
    this.root.add(this.body);
    const width = 0.5 + appearance.widthOffset * 0.03 + (appearance.body === 'broad' ? 0.08 : appearance.body === 'slim' ? -0.06 : 0);
    const tall = appearance.heightOffset * 0.04;

    this.leftLeg = this.leg(-0.12);
    this.rightLeg = this.leg(0.12);

    const torso = new Group();
    torso.position.y = HIP_HEIGHT;
    this.body.add(torso);
    this.cube(torso, palette.coat, [width, TORSO + tall, 0.32], [0, (TORSO + tall) / 2, 0]);
    this.cube(torso, shade(palette.coat, -0.25), [width + 0.02, 0.08, 0.34], [0, 0.04, 0]);
    if (appearance.outfit === 'overalls') this.cube(torso, palette.accent, [width * 0.62, TORSO * 0.62, 0.02], [0, TORSO * 0.36, 0.17]);
    else if (appearance.outfit === 'cardigan' || appearance.outfit === 'jacket') this.cube(torso, palette.accent, [0.06, TORSO * 0.9, 0.02], [0, TORSO * 0.47, 0.17]);
    else if (appearance.outfit === 'hoodie') this.cube(torso, shade(palette.coat, -0.2), [width * 0.8, 0.16, 0.36], [0, TORSO + tall - 0.04, -0.02]);
    else if (appearance.outfit === 'dress') this.cube(torso, palette.accent, [width + 0.08, 0.26, 0.38], [0, 0.1, 0]);
    else this.cube(torso, palette.accent, [width + 0.01, 0.07, 0.33], [0, TORSO * 0.7, 0]);
    if (barista) this.cube(torso, '#e8d7b6', [width * 0.7, TORSO * 0.62, 0.02], [0, TORSO * 0.32, 0.17]);

    const shoulder = HIP_HEIGHT + TORSO + tall - 0.06;
    this.leftArm = this.arm(-(width / 2 + 0.08), shoulder);
    this.rightArm = this.arm(width / 2 + 0.08, shoulder);

    const head = new Group();
    head.position.y = HIP_HEIGHT + TORSO + tall + 0.02;
    this.body.add(head);
    this.cube(head, palette.skin, [0.56, HEAD, 0.52], [0, HEAD / 2, 0]);
    this.face(head);
    this.hair(head);

    this.prop.position.set(0, HIP_HEIGHT + TORSO * 0.45, 0.32);
    this.body.add(this.prop);
  }

  update(input: VoxelPoseInput): void {
    const { visual } = input;
    const seated = visual.seated;
    const walking = visual.pose === 'walking';
    const swing = walking ? Math.sin(input.time * 9) * 0.55 : 0;
    const reset = (limb: Limb, x: number): void => {
      limb.pivot.rotation.set(x, 0, 0);
      limb.lower?.rotation.set(0, 0, 0);
    };

    if (seated) {
      // Hüfte auf der Sitzfläche, Oberschenkel waagerecht, Unterschenkel nach unten.
      this.body.position.y = input.seatHeight - HIP_HEIGHT;
      for (const leg of [this.leftLeg, this.rightLeg]) {
        leg.pivot.rotation.set(-Math.PI / 2, 0, 0);
        leg.lower?.rotation.set(Math.PI / 2, 0, 0);
      }
      const reach = input.seatView === 'back' ? -1.2 : -0.9;
      reset(this.leftArm, reach);
      reset(this.rightArm, reach + (visual.frame % 2 === 0 ? 0 : 0.08));
    } else {
      this.body.position.y = 0;
      reset(this.leftLeg, swing);
      reset(this.rightLeg, -swing);
      const activeArms = visual.pose !== 'walking' && visual.pose !== 'waiting';
      reset(this.leftArm, walking ? -swing * 0.8 : activeArms ? -0.8 : 0);
      reset(this.rightArm, walking ? swing * 0.8 : activeArms ? -0.8 : 0);
    }
    if (visual.gesture === 'wave') this.rightArm.pivot.rotation.set(0, 0, 2.6 + Math.sin(input.time * 10) * 0.3);

    this.root.rotation.y = this.headingFor(input);
    this.updateProp(visual.pose, seated);
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private headingFor(input: VoxelPoseInput): number {
    if (input.visual.seated) {
      if (input.seatView === 'back') return Math.PI;
      if (input.seatView === 'side') return input.visual.facing * Math.PI / 2;
      return 0;
    }
    if (input.visual.pose === 'walking' && input.heading && Math.hypot(input.heading.x, input.heading.z) > 0.01) {
      return Math.atan2(input.heading.x, input.heading.z);
    }
    if (input.visual.pose === 'ordering') return Math.PI;
    return input.visual.facing * 0.45;
  }

  private updateProp(pose: CharacterVisualState['pose'], seated: boolean): void {
    const kind = `${pose}:${seated}`;
    if (kind === this.propKind) return;
    this.propKind = kind;
    for (const child of [...this.prop.children]) child.removeFromParent();
    this.prop.position.set(0, (seated ? HIP_HEIGHT : HIP_HEIGHT) + TORSO * 0.42, 0.38);
    switch (pose) {
      case 'reading':
      case 'journaling':
      case 'sketching':
        this.cube(this.prop, '#f2dfb5', [0.34, 0.03, 0.24], [0, 0, 0]);
        this.cube(this.prop, '#bd695a', [0.04, 0.04, 0.24], [0, 0.01, 0]);
        break;
      case 'drinking':
      case 'tasting':
        this.cube(this.prop, '#ead9bb', [0.12, 0.14, 0.12], [0.12, 0.05, 0]);
        break;
      case 'typing':
        this.cube(this.prop, '#243346', [0.42, 0.03, 0.28], [0, 0, 0]);
        this.cube(this.prop, '#84a9a5', [0.4, 0.26, 0.02], [0, 0.13, -0.14]);
        break;
      case 'phone':
        this.cube(this.prop, '#211923', [0.08, 0.15, 0.02], [0.16, 0.12, 0]);
        break;
      case 'knitting':
        this.cube(this.prop, '#d65978', [0.2, 0.12, 0.12], [0, 0.04, 0]);
        break;
      case 'board-game':
        this.cube(this.prop, '#d5ad64', [0.42, 0.03, 0.3], [0, 0, 0]);
        break;
      case 'handheld':
        this.cube(this.prop, '#c9c6bd', [0.16, 0.22, 0.04], [0, 0.12, 0]);
        this.cube(this.prop, '#8bac0f', [0.11, 0.08, 0.01], [0, 0.17, 0.025]);
        break;
      default:
        break;
    }
  }

  private material(color: string): MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
      this.materials.set(color, material);
    }
    return material;
  }

  private cube(parent: Object3D, color: string, size: readonly [number, number, number], position: readonly [number, number, number]): Mesh {
    const mesh = new Mesh(UNIT_BOX, this.material(color));
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private leg(x: number): Limb {
    const pivot = new Group();
    pivot.position.set(x, HIP_HEIGHT, 0);
    this.body.add(pivot);
    this.cube(pivot, this.palette.trousers, [0.2, THIGH, 0.22], [0, -THIGH / 2, 0]);
    const lower = new Group();
    lower.position.y = -THIGH;
    pivot.add(lower);
    this.cube(lower, shade(this.palette.trousers, -0.12), [0.19, SHIN, 0.2], [0, -SHIN / 2, 0]);
    this.cube(lower, this.palette.shoes, [0.22, SHOE, 0.3], [0, -SHIN - SHOE / 2, 0.04]);
    return { pivot, lower };
  }

  private arm(x: number, shoulder: number): Limb {
    const pivot = new Group();
    pivot.position.set(x, shoulder, 0);
    this.body.add(pivot);
    this.cube(pivot, shade(this.palette.coat, -0.08), [0.15, 0.48, 0.16], [0, -0.24, 0]);
    this.cube(pivot, this.palette.skin, [0.13, 0.1, 0.14], [0, -0.53, 0]);
    return { pivot };
  }

  private face(head: Group): void {
    const { appearance, palette } = this;
    const front = 0.265;
    for (const x of [-0.12, 0.12]) this.cube(head, '#211923', [0.07, 0.08, 0.02], [x, HEAD * 0.52, front]);
    this.cube(head, '#75434a', [0.14, 0.03, 0.02], [0, HEAD * 0.28, front]);
    this.cube(head, shade(palette.skin, -0.1), [0.06, 0.06, 0.03], [0, HEAD * 0.4, front + 0.01]);
    if (appearance.detail === 'glasses') {
      for (const x of [-0.12, 0.12]) this.cube(head, '#313141', [0.16, 0.12, 0.02], [x, HEAD * 0.52, front + 0.012]);
    } else if (appearance.detail === 'beard') {
      this.cube(head, shade(palette.hair, 0.05), [0.5, 0.18, 0.04], [0, HEAD * 0.18, front]);
    } else if (appearance.detail === 'freckles') {
      for (const x of [-0.16, -0.1, 0.1, 0.16]) this.cube(head, '#a35c51', [0.03, 0.03, 0.02], [x, HEAD * 0.38, front]);
    }
  }

  private hair(head: Group): void {
    const color = this.palette.hair;
    const dark = shade(color, -0.25);
    const style = this.appearance.hair;
    // Kappe oben und Hinterkopf gehören zu jeder Frisur.
    this.cube(head, color, [0.6, 0.14, 0.56], [0, HEAD + 0.05, 0]);
    this.cube(head, dark, [0.6, HEAD * 0.7, 0.1], [0, HEAD * 0.62, -0.25]);
    if (style === 'crop' || style === 'undercut') return;
    if (style === 'bob' || style === 'waves') {
      for (const x of [-0.29, 0.29]) this.cube(head, color, [0.08, HEAD * 0.7, 0.5], [x, HEAD * 0.55, -0.02]);
    } else if (style === 'long') {
      for (const x of [-0.29, 0.29]) this.cube(head, color, [0.08, HEAD * 0.95, 0.46], [x, HEAD * 0.45, -0.04]);
      this.cube(head, dark, [0.58, 0.4, 0.1], [0, -0.1, -0.24]);
    } else if (style === 'bun') {
      this.cube(head, dark, [0.24, 0.2, 0.22], [0, HEAD + 0.2, -0.12]);
    } else if (style === 'ponytail') {
      this.cube(head, dark, [0.14, 0.42, 0.14], [0, HEAD * 0.35, -0.34]);
    } else if (style === 'curls') {
      for (const [x, y, z] of [[-0.24, 0.62, 0.1], [0.24, 0.62, 0.1], [0, 0.66, 0.16], [-0.3, 0.4, -0.05], [0.3, 0.4, -0.05]] as const) {
        this.cube(head, color, [0.16, 0.16, 0.16], [x, y, z]);
      }
    }
  }
}
