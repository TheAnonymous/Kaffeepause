import { Group, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D } from 'three';
import type { Guest, GuestAppearance, GuestPalette } from '../simulation/types';
import type { ActivitySpotKind } from '../simulation/layout';
import type { VenueKind } from '../venue';
import type { CharacterExpression, CharacterVisualState, SeatView } from './characterVisualState';
import { FIGURE, HIP_HEIGHT } from './characters';
import { BoxBatch, mix, shade, type Position, type Size } from './voxelKit';

// Klötzchen-Figuren im Stil der Möbel: echte Tiefe, echtes Hinsetzen und Umdrehen,
// Gesichter mit Ausdruck, Hände mit Gegenständen und kleine Bewegungen.

const MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });

type MouthKind = 'neutral' | 'smile' | 'laugh' | 'surprised' | 'sorry' | 'focused' | 'talk';
type PropKind = 'book' | 'notebook' | 'sketchbook' | 'knitting' | 'handheld' | 'laptop' | 'board' | 'cup'
  | 'phone' | 'tray' | 'cloth' | 'box' | 'chopsticks' | 'umbrella';
type Anchor = 'front' | 'table' | 'lap' | 'counter' | 'up' | 'right-hand' | 'left-hand';

const MOUTH_KINDS: readonly MouthKind[] = ['neutral', 'smile', 'laugh', 'surprised', 'sorry', 'focused', 'talk'];
const MOUTH_DARK = '#5e2935';

let sharedEyes: BufferGeometry | undefined;
const sharedMouths = new Map<MouthKind, BufferGeometry>();
const sharedProps = new Map<PropKind, BufferGeometry>();

function eyesGeometry(): BufferGeometry {
  sharedEyes ??= (() => {
    const batch = new BoxBatch();
    for (const side of [-1, 1]) {
      batch.add([0.11, 0.12, 0.02], [side * 0.13, 0, 0], '#f5efe4');
      batch.add([0.065, 0.085, 0.02], [side * 0.12, -0.008, 0.007], '#2a2230');
      batch.add([0.026, 0.026, 0.02], [side * 0.12 + 0.016, 0.018, 0.013], '#ffffff');
    }
    return batch.build();
  })();
  return sharedEyes;
}

function mouthGeometry(kind: MouthKind): BufferGeometry {
  let geometry = sharedMouths.get(kind);
  if (geometry) return geometry;
  const batch = new BoxBatch();
  if (kind === 'neutral') batch.add([0.12, 0.026, 0.02], [0, 0, 0], MOUTH_DARK);
  else if (kind === 'focused') batch.add([0.07, 0.024, 0.02], [0, 0, 0], MOUTH_DARK);
  else if (kind === 'smile') {
    batch.add([0.1, 0.026, 0.02], [0, -0.012, 0], MOUTH_DARK);
    for (const side of [-1, 1]) batch.add([0.026, 0.026, 0.02], [side * 0.058, 0.008, 0], MOUTH_DARK);
  } else if (kind === 'sorry') {
    batch.add([0.1, 0.026, 0.02], [0, 0.004, 0], MOUTH_DARK);
    for (const side of [-1, 1]) batch.add([0.026, 0.026, 0.02], [side * 0.058, -0.016, 0], MOUTH_DARK);
  } else if (kind === 'surprised') batch.add([0.06, 0.075, 0.02], [0, -0.01, 0], '#4a1f2a');
  else if (kind === 'talk') {
    batch.add([0.1, 0.05, 0.02], [0, -0.008, 0], '#4a1f2a');
    batch.add([0.06, 0.02, 0.022], [0, -0.022, 0.001], '#d8606a');
  } else {
    batch.add([0.15, 0.075, 0.02], [0, -0.012, 0], '#4a1f2a');
    batch.add([0.1, 0.016, 0.022], [0, 0.018, 0.001], '#f4efe6');
    batch.add([0.08, 0.026, 0.022], [0, -0.034, 0.001], '#d8606a');
  }
  geometry = batch.build();
  sharedMouths.set(kind, geometry);
  return geometry;
}

function propGeometry(kind: PropKind): BufferGeometry {
  let geometry = sharedProps.get(kind);
  if (geometry) return geometry;
  const batch = new BoxBatch();
  switch (kind) {
    case 'book':
      batch.add([0.32, 0.03, 0.23], [0, 0, 0], '#a8483f');
      batch.add([0.14, 0.03, 0.21], [-0.075, 0.02, 0], '#f2e6c9', { z: 0.08 });
      batch.add([0.14, 0.03, 0.21], [0.075, 0.02, 0], '#e8dcbc', { z: -0.08 });
      break;
    case 'notebook':
      batch.add([0.28, 0.025, 0.21], [0, 0, 0], '#f2e6c9');
      for (const z of [-0.05, 0, 0.05]) batch.add([0.2, 0.027, 0.008], [0, 0.002, z], '#9c8a78');
      batch.add([0.02, 0.02, 0.17], [0.1, 0.03, 0.02], '#2d2a36', { y: 0.5 });
      break;
    case 'sketchbook':
      batch.add([0.3, 0.025, 0.22], [0, 0, 0], '#efe6d2');
      batch.add([0.12, 0.027, 0.08], [-0.04, 0.002, 0.02], '#c95c54');
      batch.add([0.02, 0.02, 0.17], [0.1, 0.03, 0.02], '#e4b447', { y: 0.5 });
      break;
    case 'knitting':
      batch.add([0.13, 0.12, 0.12], [-0.1, 0, 0], '#d65978');
      batch.add([0.2, 0.1, 0.03], [0.06, 0.02, 0.02], '#e07a93');
      batch.add([0.015, 0.015, 0.3], [0.06, 0.07, 0], '#efd9a6', { y: 0.6 });
      batch.add([0.015, 0.015, 0.3], [0.06, 0.07, 0], '#efd9a6', { y: -0.6 });
      break;
    case 'handheld':
      batch.add([0.17, 0.23, 0.045], [0, 0, 0], '#c9c6bd');
      batch.add([0.11, 0.085, 0.01], [0, 0.045, 0.027], '#8bac0f');
      batch.add([0.05, 0.016, 0.01], [-0.045, -0.055, 0.027], '#3b3a40');
      batch.add([0.016, 0.05, 0.01], [-0.045, -0.055, 0.027], '#3b3a40');
      batch.add([0.025, 0.025, 0.01], [0.04, -0.048, 0.027], '#9a2257');
      batch.add([0.025, 0.025, 0.01], [0.065, -0.03, 0.027], '#9a2257');
      break;
    case 'laptop':
      batch.add([0.42, 0.03, 0.29], [0, 0, 0], '#2c3646');
      batch.add([0.42, 0.28, 0.025], [0, 0.14, -0.15], '#2c3646', { x: -0.28 });
      batch.add([0.36, 0.22, 0.01], [0, 0.145, -0.135], '#86c2bd', { x: -0.28 });
      break;
    case 'board':
      batch.add([0.38, 0.025, 0.38], [0, 0, 0], '#d5ad64');
      batch.add([0.06, 0.08, 0.06], [-0.08, 0.05, 0.06], '#7d4c53');
      batch.add([0.06, 0.1, 0.06], [0.1, 0.06, -0.05], '#4b887d');
      break;
    case 'cup':
      batch.add([0.11, 0.13, 0.11], [0, 0, 0], '#ead9bb');
      batch.add([0.09, 0.01, 0.09], [0, 0.065, 0], '#7a4a36');
      batch.add([0.03, 0.07, 0.03], [0.07, 0, 0], '#ead9bb');
      break;
    case 'phone':
      batch.add([0.08, 0.15, 0.02], [0, 0, 0], '#211923');
      batch.add([0.064, 0.12, 0.01], [0, 0, 0.012], '#6fd6d0');
      break;
    case 'tray':
      batch.add([0.38, 0.025, 0.26], [0, 0, 0], '#5b4b50');
      batch.add([0.1, 0.12, 0.1], [0.08, 0.07, 0], '#ead9bb');
      batch.add([0.12, 0.05, 0.1], [-0.09, 0.04, 0], '#e6b56e');
      break;
    case 'cloth':
      batch.add([0.17, 0.03, 0.12], [0, 0, 0], '#7bc8bd');
      break;
    case 'box':
      batch.add([0.3, 0.2, 0.22], [0, 0, 0], '#9b6747');
      batch.add([0.31, 0.03, 0.23], [0, 0.07, 0], '#e4bb73');
      break;
    case 'chopsticks':
      batch.add([0.015, 0.015, 0.26], [0.01, 0, 0.08], '#e6dac0', { y: 0.12 });
      batch.add([0.015, 0.015, 0.26], [-0.01, 0.02, 0.08], '#e6dac0', { y: -0.05 });
      break;
    case 'umbrella':
      batch.add([0.03, 0.8, 0.03], [0, -0.3, 0], '#e0bb70');
      batch.add([0.12, 0.5, 0.12], [0, -0.35, 0], '#4a5260');
      batch.add([0.08, 0.05, 0.08], [0, 0.1, 0], '#3a3a44');
      break;
    default:
      break;
  }
  geometry = batch.build();
  sharedProps.set(kind, geometry);
  return geometry;
}

export interface VoxelFigureOptions {
  readonly palette: GuestPalette;
  readonly appearance: GuestAppearance;
  readonly venue: VenueKind;
  readonly accessory?: Guest['accessory'];
  readonly barista?: boolean;
  /** Startphase für Atmen und Blinzeln, damit nicht alle im Gleichtakt sind. */
  readonly seed?: number;
}

export interface VoxelPoseInput {
  readonly visual: CharacterVisualState;
  readonly seatView?: SeatView;
  readonly spotKind?: ActivitySpotKind;
  /** Bewegungsrichtung in der Ebene (Diorama-x/z), wenn die Figur läuft. */
  readonly heading?: { readonly x: number; readonly z: number };
  readonly seatHeight: number;
  readonly time: number;
}

interface Arm {
  readonly shoulder: Group;
  readonly elbow: Group;
  readonly hand: Group;
  readonly side: 1 | -1;
}

interface Leg {
  readonly hip: Group;
  readonly knee: Group;
}

/** Ein Gelenk, dessen Drehung weich der Zielhaltung folgt. */
interface Joint {
  readonly object: Object3D;
  readonly axis: 'x' | 'y' | 'z';
  /** Wie schnell das Gelenk nachzieht (1/s); höher heißt straffer. */
  readonly rate: number;
  value: number;
}

const LEG_RATE = 12;
const ARM_RATE = 14;
const HEAD_RATE = 8;
const BODY_RATE = 9;
const TURN_RATE = 7;

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export class VoxelFigure {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly torso = new Group();
  private readonly head = new Group();
  private readonly eyes: Mesh;
  private readonly brows: Mesh;
  private readonly mouths = new Map<MouthKind, Mesh>();
  private readonly arms: { readonly left: Arm; readonly right: Arm };
  private readonly legs: readonly Leg[];
  private readonly anchors: Record<Exclude<Anchor, 'right-hand' | 'left-hand'>, Group>;
  private readonly propMeshes = new Map<PropKind, Mesh>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly phase: number;
  private readonly mouthZ: number;
  private readonly browY: number;
  private currentMouth?: MouthKind;
  private readonly joints: Joint[] = [];
  private lastTime?: number;
  private yaw = 0;
  private bodyY = 0;
  private pendingProp?: { kind: PropKind; anchor: Anchor };

  constructor(private readonly options: VoxelFigureOptions) {
    const { appearance } = options;
    this.phase = (options.seed ?? 0) * 1.37;
    this.root.name = 'voxel-figure';
    this.root.add(this.body);

    const width = 0.52 + appearance.widthOffset * 0.03
      + ({ broad: 0.08, slim: -0.06, soft: 0.04, compact: 0.02, angular: 0 } as const)[appearance.body];
    const depth = 0.32 + (appearance.body === 'soft' ? 0.04 : appearance.body === 'broad' ? 0.02 : 0);
    const torsoHeight = FIGURE.torso + appearance.heightOffset * 0.035;

    this.legs = [-1, 1].map((side) => this.buildLeg(side * 0.115));

    this.torso.position.y = HIP_HEIGHT;
    this.body.add(this.torso);
    this.mesh(this.torso, this.torsoBatch(width, depth, torsoHeight));

    const shoulderY = torsoHeight - 0.05;
    this.arms = {
      left: this.buildArm(-1, width, shoulderY),
      right: this.buildArm(1, width, shoulderY),
    };

    const headWidth = ({ round: 0.62, oval: 0.58, square: 0.62, narrow: 0.54 } as const)[appearance.face];
    const headHeight = appearance.face === 'round' ? 0.6 : FIGURE.head;
    const headDepth = 0.54;
    this.head.position.y = torsoHeight + FIGURE.neck;
    // Erst zur Seite drehen, dann nicken: sonst kippt der Kopf beim Runterschauen schräg.
    this.head.rotation.order = 'YXZ';
    this.torso.add(this.head);
    this.mesh(this.head, this.headBatch(headWidth, headHeight, headDepth));
    const front = headDepth / 2;
    this.eyes = new Mesh(eyesGeometry(), MATERIAL);
    this.eyes.position.set(0, headHeight * 0.47, front + 0.006);
    this.head.add(this.eyes);
    const browBatch = new BoxBatch();
    const browColor = shade(this.hairColor(), -0.25);
    for (const side of [-1, 1]) browBatch.add([0.12, 0.03, 0.02], [side * 0.13, 0, 0], browColor);
    this.brows = this.mesh(this.head, browBatch);
    this.browY = headHeight * 0.63;
    this.brows.position.set(0, this.browY, front + 0.008);
    this.mouthZ = front + (appearance.detail === 'beard' ? 0.05 : 0.01);
    for (const kind of MOUTH_KINDS) {
      const mouth = new Mesh(mouthGeometry(kind), MATERIAL);
      mouth.position.set(0, headHeight * 0.22, this.mouthZ);
      mouth.visible = false;
      this.head.add(mouth);
      this.mouths.set(kind, mouth);
    }

    const anchor = (position: Position): Group => {
      const group = new Group();
      group.position.set(...position);
      this.torso.add(group);
      return group;
    };
    this.anchors = {
      front: anchor([0, 0.42, depth / 2 + 0.26]),
      table: anchor([0, 0.4, depth / 2 + 0.42]),
      lap: anchor([0, 0.1, depth / 2 + 0.26]),
      counter: anchor([0, 0.6, depth / 2 + 0.3]),
      up: anchor([0, torsoHeight + 0.35, depth / 2 + 0.22]),
    };
    this.root.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const joint = (object: Object3D, axis: Joint['axis'], rate: number): void => {
      this.joints.push({ object, axis, rate, value: 0 });
    };
    for (const leg of this.legs) {
      joint(leg.hip, 'x', LEG_RATE);
      joint(leg.hip, 'z', LEG_RATE);
      joint(leg.knee, 'x', LEG_RATE);
    }
    for (const arm of [this.arms.left, this.arms.right]) {
      joint(arm.shoulder, 'x', ARM_RATE);
      joint(arm.shoulder, 'z', ARM_RATE);
      joint(arm.elbow, 'x', ARM_RATE);
    }
    joint(this.head, 'x', HEAD_RATE);
    joint(this.head, 'y', HEAD_RATE);
    joint(this.torso, 'z', HEAD_RATE);
    joint(this.body, 'z', BODY_RATE);
  }

  update(input: VoxelPoseInput): void {
    // Zeitschritt seit dem letzten Bild; bei Sprüngen (Tab im Hintergrund, Standbild) wird nicht geglättet.
    const delta = this.lastTime === undefined ? 0 : input.time - this.lastTime;
    this.lastTime = input.time;
    const snap = delta <= 0 || delta > 0.5;
    this.pose(input);
    this.settle(snap ? 0 : delta, input);
  }

  /** Zieht Gelenke, Körperhöhe und Blickrichtung weich zur eben gesetzten Zielhaltung. */
  private settle(delta: number, input: VoxelPoseInput): void {
    const follow = (current: number, target: number, rate: number): number => (
      delta === 0 ? target : current + (target - current) * (1 - Math.exp(-rate * delta))
    );
    for (const joint of this.joints) {
      joint.value = follow(joint.value, joint.object.rotation[joint.axis], joint.rate);
      joint.object.rotation[joint.axis] = joint.value;
    }
    this.bodyY = follow(this.bodyY, this.body.position.y, BODY_RATE);
    this.body.position.y = this.bodyY;
    const targetYaw = this.headingFor(input);
    this.yaw = delta === 0 ? targetYaw : this.yaw + wrapAngle(targetYaw - this.yaw) * (1 - Math.exp(-TURN_RATE * delta));
    this.root.rotation.y = this.yaw;
    this.showProp(this.pendingProp);
  }

  private pose(input: VoxelPoseInput): void {
    const { visual } = input;
    const t = input.time + this.phase;
    const pose = visual.pose;
    const seated = visual.seated;
    const walking = pose === 'walking';

    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.torso.scale.set(1, 1 + Math.sin(t * 2.1) * 0.012, 1);
    this.head.rotation.set(0, 0, 0);

    // Beine: sitzend waagerecht, laufend im Schritt, stehend ruhig.
    const [left, right] = this.legs;
    if (seated) {
      this.body.position.y = input.seatHeight - HIP_HEIGHT;
      for (const [index, leg] of this.legs.entries()) {
        leg.hip.rotation.set(-Math.PI / 2, 0, (index === 0 ? -1 : 1) * 0.05);
        leg.knee.rotation.set(Math.PI / 2, 0, 0);
      }
    } else if (walking) {
      const step = Math.sin(t * 8);
      if (left && right) {
        left.hip.rotation.set(step * 0.5, 0, 0);
        right.hip.rotation.set(-step * 0.5, 0, 0);
        left.knee.rotation.set(Math.max(0, -step) * 0.7, 0, 0);
        right.knee.rotation.set(Math.max(0, step) * 0.7, 0, 0);
      }
      this.body.position.y = Math.abs(Math.cos(t * 8)) * 0.03;
    } else {
      for (const leg of this.legs) {
        leg.hip.rotation.set(0, 0, 0);
        leg.knee.rotation.set(0, 0, 0);
      }
      this.body.rotation.z = Math.sin(t * 0.7) * 0.015;
    }

    this.pendingProp = this.poseArms(input, t);
    this.poseHead(input, t);
    this.updateFace(input, t);
    this.body.position.y += visual.offsetY;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
  }

  private headingFor(input: VoxelPoseInput): number {
    const { visual } = input;
    if (visual.seated) {
      if (input.seatView === 'back') return Math.PI;
      if (input.seatView === 'side') return visual.facing * Math.PI / 2;
      return 0;
    }
    if (visual.pose === 'walking' && input.heading && Math.hypot(input.heading.x, input.heading.z) > 0.01) {
      return Math.atan2(input.heading.x, input.heading.z);
    }
    if (input.spotKind === 'arcade-cabinet') return visual.facing * Math.PI / 2;
    if (visual.pose === 'ordering') return Math.PI;
    if (this.options.barista) return 0;
    return visual.facing * 0.4;
  }

  /** Setzt Arme passend zur Tätigkeit und gibt zurück, welcher Gegenstand wo liegt. */
  private poseArms(input: VoxelPoseInput, t: number): { kind: PropKind; anchor: Anchor } | undefined {
    const { visual } = input;
    const { left, right } = this.arms;
    const set = (arm: Arm, upper: number, elbow: number, spread = 0): void => {
      arm.shoulder.rotation.set(upper, 0, arm.side * spread);
      arm.elbow.rotation.set(elbow, 0, 0);
    };
    const relaxed = (arm: Arm): void => set(arm, 0.04, -0.14, 0.07);
    const holdFront = (arm: Arm): void => set(arm, -0.5, -1.35, -0.22);
    const reachTable = (arm: Arm): void => set(arm, -0.95, -0.45, -0.12);
    const seatedAtTable = visual.seated && (input.seatView === 'side' || input.seatView === 'back');
    const reach = seatedAtTable || input.spotKind === 'arcade-cabinet' || this.options.barista;
    let prop: { kind: PropKind; anchor: Anchor } | undefined;

    switch (visual.pose) {
      case 'walking': {
        const swing = Math.sin(t * 8);
        set(left, -swing * 0.45, -0.25, 0.05);
        set(right, swing * 0.45, -0.25, 0.05);
        break;
      }
      case 'waiting':
        relaxed(left);
        relaxed(right);
        break;
      case 'ordering':
        relaxed(left);
        set(right, -1.25 - Math.max(0, Math.sin(t * 1.3)) * 0.2, -0.15);
        break;
      case 'reading':
      case 'journaling':
      case 'sketching':
      case 'knitting':
      case 'handheld': {
        const wiggle = visual.pose === 'knitting' ? Math.sin(t * 7) * 0.08 : visual.pose === 'handheld' ? Math.sin(t * 14) * 0.03
          : visual.pose === 'reading' ? 0 : Math.sin(t * 5) * 0.06;
        set(left, -0.5, -1.35 + wiggle, -0.22);
        set(right, -0.5, -1.35 - wiggle, -0.22);
        const kind = ({ reading: 'book', journaling: 'notebook', sketching: 'sketchbook', knitting: 'knitting', handheld: 'handheld' } as const)[visual.pose];
        prop = { kind, anchor: seatedAtTable && visual.pose !== 'handheld' && visual.pose !== 'knitting' ? 'table' : 'front' };
        if (prop.anchor === 'table') {
          reachTable(left);
          reachTable(right);
        }
        break;
      }
      case 'typing':
      case 'board-game': {
        const tap = visual.pose === 'typing' ? Math.sin(t * 18) * 0.05 : 0;
        if (reach) {
          set(left, -0.95, -0.45 + tap, -0.12);
          set(right, -0.95, -0.45 - tap, -0.12);
        } else {
          set(left, -0.25, -0.9 + tap, -0.18);
          set(right, -0.25, -0.9 - tap, -0.18);
        }
        prop = { kind: visual.pose === 'typing' ? 'laptop' : 'board', anchor: reach ? 'table' : 'lap' };
        break;
      }
      case 'drinking':
      case 'tasting': {
        if (input.spotKind === 'counter-stool') {
          reachTable(left);
          set(right, -1.0 + Math.sin(t * 3) * 0.12, -0.7);
          prop = { kind: 'chopsticks', anchor: 'right-hand' };
          break;
        }
        const cycle = (t % 6) / 6;
        const lift = cycle < 0.22 ? Math.sin((cycle / 0.22) * Math.PI) : 0;
        if (reach) reachTable(left);
        else holdFront(left);
        set(right, -0.38 - lift * 0.2, -1.1 - lift * 1.15, -0.18);
        prop = { kind: 'cup', anchor: 'right-hand' };
        break;
      }
      case 'phone':
        relaxed(left);
        set(right, -0.25, -1.95, -0.2);
        prop = { kind: 'phone', anchor: 'right-hand' };
        break;
      case 'talking':
        if (reach) reachTable(left);
        else relaxed(left);
        set(right, -0.45 + Math.sin(t * 3) * 0.25, -1.0 + Math.sin(t * 2.2) * 0.2, -0.1);
        break;
      case 'machine':
        reachTable(left);
        reachTable(right);
        break;
      case 'serving':
        holdFront(left);
        holdFront(right);
        prop = { kind: 'tray', anchor: 'front' };
        break;
      case 'wiping':
        relaxed(left);
        set(right, -0.95 + Math.sin(t * 6) * 0.15, -0.45, Math.cos(t * 6) * 0.2);
        prop = { kind: 'cloth', anchor: 'right-hand' };
        break;
      case 'polishing':
        holdFront(left);
        set(right, -0.4, -1.15 + Math.sin(t * 8) * 0.1, -0.3);
        prop = { kind: 'cup', anchor: 'left-hand' };
        break;
      case 'restocking':
        set(left, -2.0, -0.5, -0.15);
        set(right, -2.0, -0.5, -0.15);
        prop = { kind: 'box', anchor: 'up' };
        break;
      case 'grinding':
        reachTable(left);
        set(right, -0.9 + Math.sin(t * 5) * 0.2, -0.5, Math.cos(t * 5) * 0.15);
        break;
      default:
        relaxed(left);
        relaxed(right);
        break;
    }

    if (input.spotKind === 'arcade-cabinet' && !visual.seated && visual.pose !== 'walking') {
      const tap = Math.sin(t * 16) * 0.05;
      set(left, -0.95, -0.4 + tap, -0.12);
      set(right, -0.95, -0.4 - tap, -0.12);
      prop = undefined;
    }

    // Gesten aus Momenten und Reaktionen haben Vorrang.
    switch (visual.gesture) {
      case 'wave':
        right.shoulder.rotation.set(0, 0, 2.6 + Math.sin(t * 10) * 0.25);
        right.elbow.rotation.set(-0.3, 0, 0);
        break;
      case 'compare':
        set(left, -0.5, -1.3 + Math.sin(t * 4) * 0.1, 0.1);
        set(right, -0.5, -1.3 - Math.sin(t * 4) * 0.1, 0.1);
        break;
      case 'swap':
        set(left, -1.25, -0.2, -0.1);
        set(right, -1.25, -0.2, -0.1);
        break;
      case 'toast':
        set(right, -2.3, -0.4, -0.1);
        prop = { kind: 'cup', anchor: 'right-hand' };
        break;
      case 'startle':
        set(left, -2.4, -0.3, 0.6);
        set(right, -2.4, -0.3, 0.6);
        break;
      case 'clean':
        set(right, -0.95 + Math.sin(t * 7) * 0.15, -0.45, Math.cos(t * 7) * 0.2);
        prop = { kind: 'cloth', anchor: 'right-hand' };
        break;
      default:
        break;
    }
    if (!prop && this.options.accessory === 'umbrella' && !visual.seated) prop = { kind: 'umbrella', anchor: 'left-hand' };
    return prop;
  }

  private poseHead(input: VoxelPoseInput, t: number): void {
    const { visual } = input;
    const looksDown = ['reading', 'journaling', 'sketching', 'knitting', 'handheld', 'phone', 'typing', 'board-game'].includes(visual.pose);
    if (looksDown) this.head.rotation.x = 0.22;
    if (visual.pose === 'talking') this.head.rotation.y = Math.sin(t * 0.9) * 0.15;
    // Im Profil sitzende Gäste drehen den Kopf etwas zur Kamera.
    if (visual.seated && input.seatView === 'side') {
      this.head.rotation.y = -visual.facing * (looksDown ? 0.45 : 0.6);
      if (looksDown) this.head.rotation.x = 0.14;
    }
    if (visual.gesture === 'nod') this.head.rotation.x = 0.05 + Math.sin(t * 9) * 0.2;
    if (visual.gesture === 'laugh' || visual.expression === 'laugh') {
      this.head.rotation.x = -0.18 + Math.sin(t * 14) * 0.04;
      this.torso.rotation.z = Math.sin(t * 16) * 0.03;
    }
  }

  private updateFace(input: VoxelPoseInput, t: number): void {
    const { visual } = input;
    const expression: CharacterExpression = visual.expression;
    let mouth: MouthKind = expression;
    if (visual.pose === 'talking' && (expression === 'smile' || expression === 'neutral')) {
      mouth = Math.floor(t * 5) % 2 === 0 ? 'talk' : 'smile';
    }
    if (mouth !== this.currentMouth) {
      if (this.currentMouth) this.mouths.get(this.currentMouth)!.visible = false;
      this.mouths.get(mouth)!.visible = true;
      this.currentMouth = mouth;
    }
    const blink = (t % 4.3) < 0.13;
    this.eyes.scale.y = expression === 'laugh' ? 0.35 : blink ? 0.12 : 1;
    const browOffset = expression === 'surprised' ? 0.035 : expression === 'focused' ? -0.015 : expression === 'sorry' ? 0.015 : 0;
    this.brows.position.y = this.browY + browOffset;
  }

  private showProp(prop: { kind: PropKind; anchor: Anchor } | undefined): void {
    for (const mesh of this.propMeshes.values()) mesh.visible = false;
    if (!prop) return;
    let mesh = this.propMeshes.get(prop.kind);
    if (!mesh) {
      mesh = new Mesh(propGeometry(prop.kind), MATERIAL);
      mesh.castShadow = true;
      this.propMeshes.set(prop.kind, mesh);
    }
    const parent = prop.anchor === 'right-hand' ? this.arms.right.hand
      : prop.anchor === 'left-hand' ? this.arms.left.hand
        : this.anchors[prop.anchor];
    if (mesh.parent !== parent) parent.add(mesh);
    mesh.visible = true;
    mesh.rotation.set(0, 0, 0);
    if (prop.anchor === 'right-hand' || prop.anchor === 'left-hand') {
      // Gegenstände in der Hand bleiben aufrecht, egal wie der Arm gebeugt ist.
      const arm = prop.anchor === 'right-hand' ? this.arms.right : this.arms.left;
      mesh.rotation.x = -(arm.shoulder.rotation.x + arm.elbow.rotation.x);
      if (prop.kind === 'umbrella') mesh.rotation.x = 0;
    } else if (prop.anchor === 'front' && prop.kind !== 'tray') {
      mesh.rotation.x = prop.kind === 'handheld' ? -0.35 : -0.55;
    }
  }

  private hairColor(): string {
    return this.options.appearance.maturity === 'older' ? mix(this.options.palette.hair, '#cfcac2', 0.45) : this.options.palette.hair;
  }

  private mesh(parent: Group, batch: BoxBatch): Mesh {
    const geometry = batch.build();
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, MATERIAL);
    parent.add(mesh);
    return mesh;
  }

  private buildLeg(x: number): Leg {
    const { palette } = this.options;
    const hip = new Group();
    hip.position.set(x, HIP_HEIGHT, 0);
    this.body.add(hip);
    this.mesh(hip, new BoxBatch().add([0.21, FIGURE.thigh, 0.22], [0, -FIGURE.thigh / 2, 0], palette.trousers));
    const knee = new Group();
    knee.position.y = -FIGURE.thigh;
    hip.add(knee);
    this.mesh(knee, new BoxBatch()
      .add([0.19, FIGURE.shin, 0.2], [0, -FIGURE.shin / 2, 0], shade(palette.trousers, -0.1))
      .add([0.22, FIGURE.shoe - 0.02, 0.3], [0, -FIGURE.shin - FIGURE.shoe / 2 + 0.01, 0.04], palette.shoes)
      .add([0.23, 0.025, 0.31], [0, -FIGURE.shin - FIGURE.shoe + 0.0125, 0.04], shade(palette.shoes, -0.3)));
    return { hip, knee };
  }

  private buildArm(side: 1 | -1, torsoWidth: number, shoulderY: number): Arm {
    const { palette } = this.options;
    const sleeve = this.options.appearance.outfit === 'overalls' ? palette.coat : palette.coat;
    const shoulder = new Group();
    shoulder.position.set(side * (torsoWidth / 2 + 0.075), shoulderY, 0);
    this.torso.add(shoulder);
    this.mesh(shoulder, new BoxBatch()
      .add([0.16, 0.12, 0.17], [0, -0.03, 0], sleeve)
      .add([0.14, 0.26, 0.15], [0, -0.17, 0], shade(sleeve, -0.05)));
    const elbow = new Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    this.mesh(elbow, new BoxBatch()
      .add([0.13, 0.2, 0.14], [0, -0.1, 0], shade(sleeve, -0.1))
      .add([0.14, 0.04, 0.15], [0, -0.2, 0], shade(sleeve, -0.25))
      .add([0.13, 0.12, 0.13], [0, -0.28, 0], palette.skin));
    const hand = new Group();
    hand.position.set(0, -0.3, 0.02);
    elbow.add(hand);
    return { shoulder, elbow, hand, side };
  }

  private torsoBatch(width: number, depth: number, height: number): BoxBatch {
    const { palette, appearance, accessory, barista, venue } = this.options;
    const front = depth / 2;
    const batch = new BoxBatch()
      .add([width, height, depth], [0, height / 2, 0], palette.coat)
      .add([width + 0.02, 0.07, depth + 0.02], [0, 0.035, 0], shade(palette.coat, -0.22))
      .add([width + 0.01, 0.06, depth + 0.01], [0, height - 0.03, 0], shade(palette.coat, 0.08))
      .add([0.2, FIGURE.neck + 0.04, 0.18], [0, height + FIGURE.neck / 2, 0], shade(palette.skin, -0.1));
    const on = (size: Size, position: Position, color: string): void => { batch.add(size, position, color); };
    switch (appearance.outfit) {
      case 'sweater':
        on([width + 0.016, 0.08, depth + 0.016], [0, height * 0.62, 0], palette.accent);
        break;
      case 'cardigan':
        on([0.14, height * 0.86, 0.02], [0, height * 0.5, front + 0.005], palette.accent);
        for (const y of [0.3, 0.5, 0.7]) on([0.035, 0.035, 0.02], [0.095, height * y, front + 0.01], '#f0d3a3');
        break;
      case 'jacket':
        on([width * 0.62, 0.09, 0.08], [0, height - 0.02, front - 0.01], shade(palette.coat, -0.15));
        on([0.025, height * 0.86, 0.02], [0, height * 0.47, front + 0.005], palette.accent);
        for (const side of [-1, 1]) on([0.12, 0.08, 0.02], [side * width * 0.28, height * 0.25, front + 0.005], shade(palette.coat, -0.15));
        break;
      case 'hoodie':
        on([width * 0.8, 0.2, 0.14], [0, height - 0.02, -(front + 0.05)], shade(palette.coat, -0.18));
        for (const side of [-1, 1]) on([0.02, 0.16, 0.02], [side * 0.06, height * 0.78, front + 0.01], palette.accent);
        on([width * 0.6, 0.12, 0.02], [0, height * 0.25, front + 0.005], shade(palette.coat, -0.12));
        break;
      case 'overalls':
        on([width * 0.62, height * 0.5, 0.02], [0, height * 0.3, front + 0.005], palette.accent);
        for (const side of [-1, 1]) {
          on([0.06, height * 0.45, 0.02], [side * width * 0.24, height * 0.7, front + 0.005], palette.accent);
          on([0.035, 0.035, 0.02], [side * width * 0.24, height * 0.52, front + 0.012], '#f1d09b');
        }
        break;
      case 'dress':
        on([width + 0.12, 0.34, depth + 0.12], [0, -0.13, 0], palette.accent);
        on([width + 0.13, 0.05, depth + 0.13], [0, -0.26, 0], shade(palette.accent, -0.15));
        break;
      default:
        break;
    }
    if (barista) {
      on([width * 0.74, height * 0.82, 0.02], [0, height * 0.42, front + 0.02], '#e8d7b6');
      on([width * 0.74, 0.04, 0.03], [0, height * 0.8, front + 0.02], shade('#e8d7b6', -0.15));
      if (venue === 'ramen') on([width * 0.9, 0.03, depth + 0.02], [0, height * 0.55, 0], '#e8d7b6');
    }
    if (accessory === 'scarf') {
      on([width * 0.72, 0.1, depth + 0.06], [0, height - 0.02, 0], palette.accent);
      on([0.1, 0.26, 0.04], [0.1, height - 0.16, front + 0.03], shade(palette.accent, -0.1));
    }
    if (accessory === 'coat') on([width + 0.06, 0.3, depth + 0.06], [0, -0.13, 0], shade(palette.coat, -0.12));
    return batch;
  }

  private headBatch(width: number, height: number, depth: number): BoxBatch {
    const { palette, appearance, accessory, barista, venue } = this.options;
    const front = depth / 2;
    const skinDark = shade(palette.skin, -0.14);
    const hair = this.hairColor();
    const hairDark = shade(hair, -0.28);
    const hairLight = shade(hair, 0.18);
    const batch = new BoxBatch()
      .add([width, height, depth], [0, height / 2, 0], palette.skin)
      .add([0.05, 0.06, 0.04], [0, height * 0.38, front + 0.02], skinDark);
    const on = (size: Size, position: Position, color: string, rotation?: { x?: number; y?: number; z?: number }): void => {
      batch.add(size, position, color, rotation);
    };
    for (const side of [-1, 1]) on([0.05, 0.13, 0.1], [side * (width / 2 + 0.025), height * 0.45, 0], shade(palette.skin, -0.06));
    if (appearance.detail !== 'beard') {
      for (const side of [-1, 1]) on([0.08, 0.035, 0.01], [side * 0.19, height * 0.3, front + 0.003], mix(palette.skin, '#e07a70', 0.45));
    }

    // Frisur: Kappe, Hinterkopf, Seiten und Pony, dann die Besonderheiten.
    on([width + 0.04, 0.13, depth + 0.04], [0, height + 0.05, -0.01], hair);
    on([width + 0.04, height * 0.72, 0.1], [0, height * 0.62, -(front + 0.03)], hairDark);
    for (const side of [-1, 1]) on([0.06, height * 0.36, depth * 0.72], [side * (width / 2 + 0.03), height * 0.74, -0.06], hair);
    on([width * 0.94, 0.09, 0.06], [0, height * 0.9, front + 0.01], hair);
    on([width * 0.5, 0.02, depth * 0.5], [-0.06, height + 0.117, 0], hairLight);
    switch (appearance.hair) {
      case 'undercut':
        on([width * 0.8, 0.08, depth * 0.8], [0.04, height + 0.13, 0.02], hair);
        for (const side of [-1, 1]) on([0.05, height * 0.2, depth * 0.7], [side * (width / 2 + 0.035), height * 0.55, -0.05], hairDark);
        break;
      case 'bob':
        for (const side of [-1, 1]) on([0.08, height * 0.62, depth * 0.8], [side * (width / 2 + 0.04), height * 0.5, -0.02], hair);
        on([width + 0.08, 0.2, 0.12], [0, height * 0.22, -(front + 0.04)], hairDark);
        break;
      case 'long':
        for (const side of [-1, 1]) on([0.08, height * 1.05, depth * 0.7], [side * (width / 2 + 0.04), height * 0.32, -0.06], hair);
        on([width + 0.06, 0.55, 0.12], [0, -0.03, -(front + 0.05)], hairDark);
        break;
      case 'waves':
        for (const side of [-1, 1]) {
          on([0.09, height * 0.9, depth * 0.66], [side * (width / 2 + 0.045), height * 0.4, -0.06], hair);
          on([0.1, 0.1, depth * 0.5], [side * (width / 2 + 0.06), height * 0.2, -0.04], hairLight);
        }
        on([width + 0.06, 0.4, 0.12], [0, height * 0.12, -(front + 0.05)], hairDark);
        break;
      case 'curls':
        for (const [x, y, z] of [[-0.24, height + 0.06, 0.1], [0.2, height + 0.08, 0.14], [0, height + 0.12, -0.05],
          [-0.3, height * 0.7, -0.08], [0.3, height * 0.7, -0.08], [-0.18, height + 0.02, -0.2], [0.18, height + 0.03, -0.22]] as const) {
          on([0.17, 0.17, 0.17], [x, y, z], hair);
        }
        on([0.08, 0.08, 0.08], [-0.2, height + 0.16, 0.12], hairLight);
        break;
      case 'bun':
        on([0.24, 0.22, 0.22], [0, height + 0.2, -0.14], hairDark);
        on([0.26, 0.04, 0.24], [0, height + 0.1, -0.14], palette.accent);
        break;
      case 'ponytail':
        on([0.1, 0.06, 0.1], [0, height * 0.62, -(front + 0.08)], palette.accent);
        on([0.14, 0.46, 0.14], [0, height * 0.3, -(front + 0.1)], hairDark, { x: 0.25 });
        break;
      default:
        break;
    }

    // Gesichtsdetails.
    switch (appearance.detail) {
      case 'glasses':
        for (const side of [-1, 1]) {
          const x = side * 0.13;
          on([0.16, 0.022, 0.02], [x, height * 0.47 + 0.075, front + 0.02], '#2e2e3a');
          on([0.16, 0.022, 0.02], [x, height * 0.47 - 0.075, front + 0.02], '#2e2e3a');
          on([0.022, 0.15, 0.02], [x - 0.08, height * 0.47, front + 0.02], '#2e2e3a');
          on([0.022, 0.15, 0.02], [x + 0.08, height * 0.47, front + 0.02], '#2e2e3a');
        }
        on([0.06, 0.02, 0.02], [0, height * 0.49, front + 0.02], '#2e2e3a');
        break;
      case 'beard':
        on([width * 0.9, 0.2, 0.06], [0, height * 0.14, front + 0.01], shade(hair, 0.05));
        on([0.22, 0.045, 0.03], [0, height * 0.29, front + 0.035], hair);
        break;
      case 'freckles':
        for (const side of [-1, 1]) {
          for (const [x, y] of [[0.16, 0.31], [0.21, 0.34], [0.23, 0.29]] as const) on([0.025, 0.025, 0.01], [side * x, height * y, front + 0.004], '#a35c51');
        }
        break;
      case 'mole':
        on([0.025, 0.025, 0.01], [0.17, height * 0.2, front + 0.004], '#553036');
        break;
      case 'earring':
        on([0.035, 0.05, 0.035], [width / 2 + 0.03, height * 0.34, 0.02], '#f2c567');
        break;
      case 'hairclip':
        on([0.1, 0.04, 0.05], [width * 0.3, height * 0.95, front + 0.03], '#f0c766');
        break;
      default:
        break;
    }
    if (accessory === 'sunglasses') {
      on([width * 0.84, 0.1, 0.03], [0, height * 0.47, front + 0.025], '#242431');
    }
    if (barista && venue === 'ramen') on([width + 0.05, 0.08, depth + 0.05], [0, height * 0.86, 0], '#f2e2c3');
    return batch;
  }
}
