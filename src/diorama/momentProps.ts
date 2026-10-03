import { Group, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import { BoxBatch } from './voxelKit';
import type { CafeMomentKind } from '../simulation/types';

// Kleine Gegenstände zu den Momenten: Was der Untertitel nennt, liegt auch auf dem Tisch –
// der Kuchen, die Karten, die Zuckerpäckchen, das letzte Gyoza, der Ticketstreifen.
// Jeder Gegenstand ist eine Gruppe aus Klötzchen-Teilen; einige bewegen sich im Lauf des Moments.

/** Worauf ein Gegenstand liegt; die Darstellung wählt danach Höhe und Lage. */
export type MomentPropSurface = 'between' | 'floor' | 'fixed';

interface PropPart {
  readonly name: string;
  readonly batch: BoxBatch;
  readonly position?: readonly [number, number, number];
  readonly rotationY?: number;
}

interface MomentPropSpec {
  readonly surface: MomentPropSurface;
  /** Feste Lage im Raum für Gegenstände, die nicht bei den Gästen liegen (x, y, z). */
  readonly fixed?: readonly [number, number, number];
  readonly parts: () => readonly PropPart[];
  /** Bewegung im Lauf des Moments, `progress` von 0 bis 1. */
  readonly animate?: (group: Group, progress: number) => void;
}

const part = (name: string, batch: BoxBatch, position?: readonly [number, number, number], rotationY?: number): PropPart => ({
  name, batch, position, rotationY,
});

const PLATE = '#efe8dc';
const PAPER = '#f6f1e3';

function plate(width = 0.26): BoxBatch {
  return new BoxBatch().add([width, 0.018, width], [0, 0.009, 0], PLATE).add([width * 0.7, 0.006, width * 0.7], [0, 0.021, 0], '#e2d9c8');
}

function card(color: string): BoxBatch {
  return new BoxBatch().add([0.07, 0.006, 0.1], [0, 0.003, 0], PAPER).add([0.03, 0.007, 0.03], [0, 0.004, 0.02], color);
}

function cup(top: string): BoxBatch {
  return new BoxBatch()
    .add([0.07, 0.08, 0.07], [0, 0.04, 0], '#ead9bb')
    .add([0.056, 0.006, 0.056], [0, 0.081, 0], top)
    .add([0.02, 0.04, 0.02], [0.045, 0.045, 0], '#ead9bb');
}

function ticket(color: string): BoxBatch {
  return new BoxBatch().add([0.1, 0.006, 0.05], [0, 0.003, 0], color).add([0.02, 0.007, 0.05], [0.03, 0.004, 0], '#7a3a1c');
}

const SPECS: Partial<Record<CafeMomentKind, MomentPropSpec>> = {
  'shared-cake': {
    surface: 'between',
    parts: () => [
      part('plate', plate()),
      part('cake', new BoxBatch()
        .add([0.14, 0.05, 0.11], [0, 0.045, 0], '#f2d7a6')
        .add([0.14, 0.02, 0.11], [0, 0.08, 0], '#8a4b2e')
        .add([0.14, 0.035, 0.11], [0, 0.107, 0], '#f2d7a6')
        .add([0.145, 0.018, 0.115], [0, 0.133, 0], '#fbf3e6')
        .add([0.035, 0.035, 0.035], [0.02, 0.158, 0], '#d8324a')),
      part('fork-a', new BoxBatch().add([0.012, 0.008, 0.12], [0, 0.03, 0], '#c9cdd2'), [-0.1, 0, 0.02], 0.4),
      part('fork-b', new BoxBatch().add([0.012, 0.008, 0.12], [0, 0.03, 0], '#c9cdd2'), [0.1, 0, 0.02], -0.4),
    ],
  },
  'card-game': {
    surface: 'between',
    parts: () => [
      part('deck', new BoxBatch().add([0.075, 0.03, 0.105], [0, 0.015, 0], '#3a5f9a').add([0.06, 0.031, 0.09], [0, 0.016, 0], '#5d84c2'), [0, 0, -0.08]),
      ...[-0.06, 0, 0.06].map((x, index) => part(`left-${index}`, card(index === 1 ? '#d8324a' : '#222630'), [-0.2 + x * 0.4, 0, 0.02 + index * 0.01], 0.5 + x * 4)),
      ...[-0.06, 0, 0.06].map((x, index) => part(`right-${index}`, card(index === 0 ? '#d8324a' : '#222630'), [0.2 + x * 0.4, 0, 0.02 + index * 0.01], -0.5 + x * 4)),
      ...[0, 1, 2, 3].map((index) => part(`played-${index}`, card(index % 2 ? '#d8324a' : '#222630'), [(index - 1.5) * 0.04, 0.008 * index, 0.06], index * 0.5)),
    ],
    animate: (group, progress) => {
      for (let index = 0; index < 4; index += 1) {
        const played = group.getObjectByName(`played-${index}`);
        if (played) played.visible = progress > 0.15 + index * 0.18;
      }
    },
  },
  'sugar-packet-domino': {
    surface: 'between',
    parts: () => [0, 1, 2, 3, 4, 5, 6].map((index) => part(
      `packet-${index}`,
      new BoxBatch().add([0.02, 0.07, 0.045], [0.01, 0.035, 0], index % 3 === 0 ? '#f2ede0' : index % 3 === 1 ? '#e9b34a' : '#c9e2f0'),
      [(index - 3) * 0.045, 0, 0],
    )),
    animate: (group, progress) => {
      for (let index = 0; index < 7; index += 1) {
        const packet = group.getObjectByName(`packet-${index}`);
        if (!packet) continue;
        // Einer nach dem anderen kippt nach rechts um.
        const fall = Math.max(0, Math.min(1, (progress - 0.2 - index * 0.06) * 6));
        packet.rotation.z = -fall * 1.3;
      }
    },
  },
  'coffee-tasting': {
    surface: 'between',
    parts: () => [
      part('board', new BoxBatch().add([0.36, 0.02, 0.12], [0, 0.01, 0], '#9a6a44')),
      part('cup-light', cup('#b98b5c'), [-0.11, 0.02, 0]),
      part('cup-mid', cup('#7a4a36'), [0, 0.02, 0]),
      part('cup-dark', cup('#3e2419'), [0.11, 0.02, 0]),
    ],
  },
  'sketch-reveal': {
    surface: 'between',
    parts: () => [part('sketchbook', new BoxBatch()
      .add([0.3, 0.012, 0.2], [0, 0.006, 0], '#5b3f32')
      .add([0.14, 0.014, 0.18], [-0.072, 0.012, 0], PAPER)
      .add([0.14, 0.014, 0.18], [0.072, 0.012, 0], PAPER)
      .add([0.08, 0.016, 0.012], [0.07, 0.016, 0.03], '#3b3b4a')
      .add([0.012, 0.016, 0.07], [0.04, 0.016, -0.01], '#3b3b4a')
      .add([0.05, 0.016, 0.012], [0.09, 0.016, -0.04], '#c45b4c')
      .add([0.02, 0.012, 0.15], [0.17, 0.02, 0], '#e8c24a'))],
  },
  'knit-gift': {
    surface: 'between',
    parts: () => [part('gift', new BoxBatch()
      .add([0.13, 0.09, 0.11], [0, 0.045, 0], '#d46a7e')
      .add([0.135, 0.02, 0.115], [0, 0.03, 0], '#f2d7a6')
      .add([0.135, 0.02, 0.115], [0, 0.07, 0], '#f2d7a6')
      .add([0.025, 0.095, 0.115], [0, 0.047, 0], '#7cc4a4')
      .add([0.06, 0.03, 0.03], [0, 0.105, 0], '#7cc4a4'))],
  },
  'pencil-return': {
    surface: 'between',
    parts: () => [part('pencil', new BoxBatch()
      .add([0.17, 0.016, 0.016], [0, 0.008, 0], '#e8c24a')
      .add([0.02, 0.017, 0.017], [-0.095, 0.008, 0], '#e48aa0')
      .add([0.025, 0.012, 0.012], [0.097, 0.008, 0], '#d9b48a'), [0, 0, 0], 0.3)],
    animate: (group, progress) => {
      const pencil = group.getObjectByName('pencil');
      if (pencil) pencil.position.x = -0.18 + Math.min(1, progress * 1.6) * 0.36;
    },
  },
  'warm-cup-offer': {
    surface: 'between',
    parts: () => [part('cup', cup('#7a4a36'))],
    animate: (group, progress) => {
      const offered = group.getObjectByName('cup');
      if (offered) offered.position.x = -0.22 + Math.min(1, progress * 1.5) * 0.44;
    },
  },
  'last-gyoza-offer': {
    surface: 'between',
    parts: () => [
      part('plate', plate(0.24)),
      part('gyoza-a', new BoxBatch().add([0.08, 0.035, 0.045], [0, 0.04, 0], '#e9cf98').add([0.07, 0.012, 0.035], [0, 0.064, 0], '#c99a5a'), [-0.04, 0, 0], 0.3),
      part('gyoza-b', new BoxBatch().add([0.08, 0.035, 0.045], [0, 0.04, 0], '#e9cf98').add([0.07, 0.012, 0.035], [0, 0.064, 0], '#c99a5a'), [0.045, 0, 0.01], -0.2),
    ],
    animate: (group, progress) => {
      // Das vorletzte ist schon gegessen; das letzte wird angeboten und verschwindet zum Schluss.
      const first = group.getObjectByName('gyoza-a');
      const last = group.getObjectByName('gyoza-b');
      if (first) first.visible = progress < 0.3;
      if (last) last.visible = progress < 0.85;
    },
  },
  'condiment-pass': {
    surface: 'between',
    parts: () => [part('bottle', new BoxBatch()
      .add([0.06, 0.13, 0.06], [0, 0.065, 0], '#b8322b')
      .add([0.035, 0.04, 0.035], [0, 0.15, 0], '#f2e6c8')
      .add([0.062, 0.04, 0.062], [0, 0.07, 0], '#f2e6c8'))],
    animate: (group, progress) => {
      const bottle = group.getObjectByName('bottle');
      if (bottle) bottle.position.x = -0.3 + Math.min(1, progress * 1.4) * 0.6;
    },
  },
  'napkin-save': {
    surface: 'between',
    parts: () => [part('napkin', new BoxBatch().add([0.16, 0.008, 0.16], [0, 0.004, 0], PAPER).add([0.03, 0.009, 0.02], [0.03, 0.005, 0.02], '#c99a5a'), [0, 0, 0], 0.4)],
  },
  'bowl-pass': {
    surface: 'between',
    parts: () => [part('bowl', new BoxBatch()
      .add([0.22, 0.08, 0.22], [0, 0.04, 0], '#b9503d')
      .add([0.18, 0.012, 0.18], [0, 0.082, 0], '#e8b464')
      .add([0.05, 0.014, 0.04], [0.04, 0.09, 0.02], '#f4efe0'))],
    animate: (group, progress) => {
      const bowl = group.getObjectByName('bowl');
      if (bowl) bowl.position.x = -0.5 + Math.min(1, progress * 1.4) * 1.0;
    },
  },
  'chopstick-drop': {
    surface: 'floor',
    parts: () => [part('chopstick', new BoxBatch().add([0.22, 0.014, 0.014], [0, 0.007, 0], '#c69a5c'), [0.25, 0, 0.35], 0.6)],
    animate: (group, progress) => {
      const stick = group.getObjectByName('chopstick');
      // Liegt am Boden, bis es zum Schluss aufgehoben wird.
      if (stick) stick.visible = progress < 0.8;
    },
  },
  'ticket-stream': {
    surface: 'floor',
    parts: () => Array.from({ length: 12 }, (_, index) => part(
      `ticket-${index}`,
      ticket(index % 2 ? '#f0a33a' : '#f6c75a'),
      [0.3 + index * 0.085, 0, 0.2 + Math.sin(index * 0.9) * 0.12],
      Math.sin(index * 0.9) * 0.5,
    )),
    animate: (group, progress) => {
      for (let index = 0; index < 12; index += 1) {
        const piece = group.getObjectByName(`ticket-${index}`);
        if (piece) piece.visible = progress > index / 14;
      }
    },
  },
  'ticket-trade': {
    surface: 'floor',
    parts: () => [
      ...[0, 1, 2].map((index) => part(`a-${index}`, ticket('#f0a33a'), [-0.18 + index * 0.085, 0, 0.3])),
      ...[0, 1, 2].map((index) => part(`b-${index}`, ticket('#7fd0f0'), [0.1 + index * 0.085, 0, 0.42])),
    ],
  },
  'lounge-prize-share': {
    surface: 'between',
    parts: () => [part('plush', new BoxBatch()
      .add([0.16, 0.16, 0.12], [0, 0.08, 0], '#e98fb4')
      .add([0.14, 0.12, 0.11], [0, 0.22, 0], '#f2a7c6')
      .add([0.045, 0.045, 0.03], [-0.05, 0.3, 0], '#e98fb4')
      .add([0.045, 0.045, 0.03], [0.05, 0.3, 0], '#e98fb4')
      .add([0.025, 0.025, 0.01], [-0.03, 0.23, 0.06], '#2a2230')
      .add([0.025, 0.025, 0.01], [0.03, 0.23, 0.06], '#2a2230'))],
  },
  'token-hopper-refill': {
    surface: 'fixed',
    // Auf dem Münztresen der Arcade.
    fixed: [2.75, 1.49, -2.55],
    parts: () => Array.from({ length: 9 }, (_, index) => part(
      `coin-${index}`,
      new BoxBatch().add([0.05, 0.012, 0.05], [0, 0.006, 0], index % 2 ? '#e7b84a' : '#f3d37a'),
      [((index % 3) - 1) * 0.055, Math.floor(index / 3) * 0.013, ((index * 7) % 3 - 1) * 0.02],
    )),
    animate: (group, progress) => {
      for (let index = 0; index < 9; index += 1) {
        const coin = group.getObjectByName(`coin-${index}`);
        if (coin) coin.visible = progress > index / 11;
      }
    },
  },
};

/** Ob ein Moment einen Gegenstand mitbringt. */
export function momentPropSurface(kind: CafeMomentKind): MomentPropSurface | undefined {
  return SPECS[kind]?.surface;
}

export function momentPropFixedPosition(kind: CafeMomentKind): readonly [number, number, number] | undefined {
  return SPECS[kind]?.fixed;
}

const MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02 });

/** Baut die Gegenstände eines Moments einmal und bewegt sie im Lauf des Moments. */
export class MomentProps {
  private readonly cache = new Map<CafeMomentKind, Group>();
  private readonly geometries: BufferGeometry[] = [];

  /** Gruppe für diesen Moment, oder `undefined`, wenn er keinen Gegenstand hat. */
  get(kind: CafeMomentKind): Group | undefined {
    const spec = SPECS[kind];
    if (!spec) return undefined;
    let group = this.cache.get(kind);
    if (!group) {
      group = new Group();
      group.name = `moment-prop:${kind}`;
      for (const entry of spec.parts()) {
        const geometry = entry.batch.build();
        this.geometries.push(geometry);
        const mesh = new Mesh(geometry, MATERIAL);
        mesh.name = entry.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (entry.position) mesh.position.set(...entry.position);
        mesh.rotation.y = entry.rotationY ?? 0;
        group.add(mesh);
      }
      this.cache.set(kind, group);
    }
    return group;
  }

  animate(kind: CafeMomentKind, group: Group, progress: number): void {
    SPECS[kind]?.animate?.(group, Math.max(0, Math.min(1, progress)));
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    for (const group of this.cache.values()) group.removeFromParent();
    this.cache.clear();
  }
}
