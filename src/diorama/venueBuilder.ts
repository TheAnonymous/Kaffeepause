import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SpotLight,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Object3D,
} from 'three';
import type { VenueKind } from '../venue';
import { DIORAMA, DIORAMA_THEMES, type AnimatedProp, type DioramaSet, type DioramaTheme } from './types';

interface BuildContext {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly theme: DioramaTheme;
}

interface ShellParts {
  readonly doorPivot: Group;
  readonly floorMaterial: MeshStandardMaterial;
  readonly exteriorMaterials: readonly MeshStandardMaterial[];
}

interface PendantParts {
  readonly light: SpotLight;
  readonly pool: Mesh<CircleGeometry, MeshBasicMaterial>;
}

interface BoxOptions {
  readonly color?: ColorRepresentation;
  readonly emissive?: ColorRepresentation;
  readonly emissiveIntensity?: number;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

function material(context: BuildContext, options: BoxOptions): MeshStandardMaterial {
  const result = new MeshStandardMaterial({
    color: options.color ?? context.theme.wood,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
    roughness: options.roughness ?? 0.76,
    metalness: options.metalness ?? 0.02,
  });
  context.materials.add(result);
  return result;
}

function box(
  context: BuildContext,
  parent: Object3D,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  options: BoxOptions = {},
): Mesh<BoxGeometry, MeshStandardMaterial> {
  const geometry = new BoxGeometry(...size);
  context.geometries.add(geometry);
  const mesh = new Mesh(geometry, material(context, options));
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  context: BuildContext,
  parent: Object3D,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  color: ColorRepresentation,
  sides = 12,
): Mesh<CylinderGeometry, MeshStandardMaterial> {
  const geometry = new CylinderGeometry(radius, radius * 1.05, height, sides);
  context.geometries.add(geometry);
  const mesh = new Mesh(geometry, material(context, { color, roughness: 0.66 }));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function glowPanel(
  context: BuildContext,
  parent: Object3D,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: ColorRepresentation,
): Mesh<BoxGeometry, MeshStandardMaterial> {
  return box(context, parent, size, position, {
    color,
    emissive: color,
    emissiveIntensity: 1.8,
    roughness: 0.35,
  });
}

function addPendant(
  context: BuildContext,
  root: Group,
  x: number,
  z: number,
  color: ColorRepresentation,
): PendantParts {
  box(context, root, [0.06, 2.05, 0.06], [x, 7.65, z], { color: context.theme.ink, castShadow: false });
  const shade = cylinder(context, root, 0.28, 0.26, [x, 6.55, z], context.theme.woodLight, 8);
  shade.rotation.x = Math.PI;
  glowPanel(context, root, [0.35, 0.06, 0.35], [x, 6.39, z], color);
  const light = new SpotLight(color, 20, 11, Math.PI / 4.5, 0.72, 1.15);
  light.position.set(x, 6.34, z);
  light.target.position.set(x, 0, z + 0.4);
  light.castShadow = false;
  root.add(light, light.target);
  const poolGeometry = new CircleGeometry(1, 32);
  const poolMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  context.geometries.add(poolGeometry);
  context.materials.add(poolMaterial);
  const pool = new Mesh(poolGeometry, poolMaterial);
  pool.position.set(x, 0.115, z + 0.4);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(2.05, 1.35, 1);
  pool.renderOrder = 1;
  root.add(pool);
  return { light, pool };
}

function addTable(context: BuildContext, root: Group, x: number, z: number, width = 2.15): void {
  box(context, root, [width, 0.15, 0.92], [x, 0.84, z], { color: context.theme.woodLight, roughness: 0.72 });
  box(context, root, [width - 0.12, 0.08, 0.74], [x, 0.94, z], { color: context.theme.wood, roughness: 0.65 });
  for (const legX of [x - width * 0.34, x + width * 0.34]) {
    box(context, root, [0.16, 0.78, 0.16], [legX, 0.4, z], { color: context.theme.wood });
  }
}

function addChair(context: BuildContext, root: Group, x: number, z: number, rotation = 0): void {
  const chair = new Group();
  chair.position.set(x, 0, z);
  chair.rotation.y = rotation;
  root.add(chair);
  box(context, chair, [0.74, 0.12, 0.68], [0, 0.52, 0], { color: context.theme.wood });
  box(context, chair, [0.74, 0.86, 0.12], [0, 0.92, -0.29], { color: context.theme.wood });
  for (const dx of [-0.27, 0.27]) {
    for (const dz of [-0.23, 0.23]) box(context, chair, [0.09, 0.5, 0.09], [dx, 0.25, dz], { color: context.theme.ink });
  }
}

function addPlant(context: BuildContext, root: Group, x: number, y: number, z: number): void {
  cylinder(context, root, 0.23, 0.37, [x, y + 0.18, z], context.theme.woodLight, 8);
  const greens = ['#426c55', '#56805c', '#789168'];
  for (let index = 0; index < 7; index += 1) {
    const leaf = box(context, root, [0.14, 0.62 - (index % 2) * 0.12, 0.1], [
      x + (index - 3) * 0.105, y + 0.67 + (index % 3) * 0.08, z + ((index % 2) - 0.5) * 0.12,
    ], { color: greens[index % greens.length], castShadow: false });
    leaf.rotation.z = (index - 3) * 0.16;
  }
}

function buildShell(context: BuildContext, root: Group): ShellParts {
  // A thick base and side walls make the scene read as a handcrafted display box.
  box(context, root, [DIORAMA.width + 0.8, 0.32, DIORAMA.depth + 0.8], [0, -0.23, 0], {
    color: context.theme.ink, roughness: 0.88,
  });
  const floor = box(context, root, [DIORAMA.width, 0.16, DIORAMA.depth], [0, 0, 0], {
    color: context.theme.floor, roughness: 0.55, metalness: 0.08,
  });
  for (let index = -7; index <= 7; index += 1) {
    const plank = box(context, root, [0.035, 0.018, DIORAMA.depth - 0.2], [index + 0.5, 0.095, 0], {
      color: context.theme.floorLine, castShadow: false,
    });
    plank.rotation.y = -0.08;
  }
  box(context, root, [0.25, DIORAMA.height, DIORAMA.depth], [-8.12, 4.35, 0], { color: context.theme.wallDark });
  box(context, root, [0.25, DIORAMA.height, DIORAMA.depth], [8.12, 4.35, 0], { color: context.theme.wallDark });

  // Back wall with an actual window opening rather than a painted rectangle.
  box(context, root, [2.6, 8.5, 0.22], [-6.7, 4.25, -3.52], { color: context.theme.wall });
  box(context, root, [4.2, 8.5, 0.22], [5.9, 4.25, -3.52], { color: context.theme.wall });
  box(context, root, [9.4, 1.55, 0.22], [-0.65, 0.77, -3.52], { color: context.theme.wall });
  box(context, root, [9.4, 1.2, 0.22], [-0.65, 7.9, -3.52], { color: context.theme.wallDark });

  const outside = new Group();
  outside.position.z = -3.72;
  root.add(outside);
  const exteriorMaterials: MeshStandardMaterial[] = [];
  const city = box(context, outside, [9.3, 6.9, 0.08], [-0.65, 4.25, 0], { color: '#668aa4', castShadow: false });
  exteriorMaterials.push(city.material);
  const skyline = ['#273448', '#354157', '#1e2b42', '#3a4557'];
  for (let index = 0; index < 15; index += 1) {
    const width = 0.5 + (index % 3) * 0.18;
    const height = 1.3 + ((index * 7) % 5) * 0.48;
    const building = box(context, outside, [width, height, 0.12], [-5 + index * 0.7, 1.1 + height / 2, 0.06], {
      color: skyline[index % skyline.length], castShadow: false,
    });
    exteriorMaterials.push(building.material);
    if (index % 2 === 0) glowPanel(context, outside, [0.12, 0.16, 0.03], [-5 + index * 0.7, 1.2 + height * 0.7, 0.14], '#e6bd75');
  }
  // Subtle transparent pane catches reflections while the city remains in real depth.
  const glassGeometry = new PlaneGeometry(9.15, 6.65);
  const glassMaterial = new MeshPhysicalMaterial({
    color: '#9fc0ca', transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0,
    transmission: 0.12, depthWrite: false, side: DoubleSide,
  });
  context.geometries.add(glassGeometry);
  context.materials.add(glassMaterial);
  const glass = new Mesh(glassGeometry, glassMaterial);
  glass.position.set(-0.65, 4.35, -3.39);
  root.add(glass);
  for (const x of [-5.25, -2.15, 0.95, 4.05]) {
    box(context, root, [0.18, 6.75, 0.26], [x, 4.3, -3.32], { color: context.theme.wallDark });
  }
  box(context, root, [9.55, 0.22, 0.32], [-0.65, 1.5, -3.28], { color: context.theme.woodLight });
  box(context, root, [9.55, 0.22, 0.32], [-0.65, 7.2, -3.28], { color: context.theme.woodLight });

  // Hinged door as physical geometry.
  const doorPivot = new Group();
  doorPivot.position.set(-7.18, 0.1, -3.2);
  root.add(doorPivot);
  box(context, doorPivot, [1.4, 3.75, 0.18], [0.7, 1.88, 0], { color: context.theme.wood, roughness: 0.65 });
  box(context, doorPivot, [1.08, 2.65, 0.08], [0.7, 2.28, 0.11], { color: context.theme.wallDark, roughness: 0.3 });
  glowPanel(context, doorPivot, [0.12, 0.12, 0.15], [1.26, 1.83, 0.18], context.theme.glow);
  box(context, root, [1.65, 0.2, 0.34], [-6.48, 3.94, -3.2], { color: context.theme.woodLight });
  return { doorPivot, floorMaterial: floor.material, exteriorMaterials };
}

function buildCafe(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  addTable(context, root, -3.55, 1.55, 2.25);
  addTable(context, root, -0.5, 1.55, 2.25);
  for (const x of [-4.15, -2.95, -1.1, 0.1]) addChair(context, root, x, 2.38, Math.PI);
  box(context, root, [4.9, 1.18, 1.35], [5.35, 0.6, -1.5], { color: context.theme.wood });
  box(context, root, [5.15, 0.16, 1.55], [5.25, 1.28, -1.5], { color: context.theme.woodLight });
  for (const x of [3.55, 4.65, 5.75, 6.85]) box(context, root, [0.72, 0.76, 0.08], [x, 0.67, -0.79], { color: context.theme.wallDark });
  // Espresso machine and cake case.
  box(context, root, [1.1, 1.05, 0.68], [5.9, 1.88, -1.58], { color: context.theme.metal, metalness: 0.72, roughness: 0.27 });
  glowPanel(context, root, [0.3, 0.18, 0.04], [6.14, 2.04, -1.22], '#e6b86c');
  cylinder(context, root, 0.12, 0.72, [5.55, 1.75, -1.12], context.theme.ink, 10).rotation.z = Math.PI / 2;
  box(context, root, [1.25, 0.65, 0.68], [3.7, 1.67, -1.55], { color: '#d9b68a', roughness: 0.4 });
  for (const x of [3.32, 3.7, 4.08]) cylinder(context, root, 0.16, 0.16, [x, 2.07, -1.35], '#d88a5d', 12);
  box(context, root, [3.8, 0.12, 0.55], [-2.65, 1.18, -2.72], { color: context.theme.woodLight });
  for (const x of [-4.1, -3.15, -2.2, -1.25]) addChair(context, root, x, -2.1, Math.PI);
  addPlant(context, root, 2.25, 1.15, -2.95);
  addPlant(context, root, -6.15, 0.05, 2.55);
  const cup = cylinder(context, root, 0.13, 0.24, [-3.4, 1.15, 1.5], '#ece0bd', 12);
  animated.push({ object: cup, phase: 0.2, speed: 1.1, amplitude: 0.025, axis: 'y' });
}

function buildRamen(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  addTable(context, root, -3.55, 1.55, 2.25);
  addTable(context, root, -0.5, 1.55, 2.25);
  for (const x of [-4.15, -2.95, -1.1, 0.1]) addChair(context, root, x, 2.38, Math.PI);
  box(context, root, [5.3, 1.15, 1.5], [5.15, 0.58, -1.45], { color: context.theme.wood });
  box(context, root, [5.55, 0.18, 1.68], [5.05, 1.26, -1.45], { color: context.theme.woodLight });
  // Open kitchen pass with noren strips.
  box(context, root, [5.35, 0.2, 0.25], [5.05, 4.35, -3.18], { color: context.theme.woodLight });
  for (const x of [3.2, 4.15, 5.1, 6.05, 7]) {
    const cloth = box(context, root, [0.75, 1.35, 0.07], [x, 3.58, -3.1], { color: context.theme.accent, castShadow: false });
    animated.push({ object: cloth, phase: x, speed: 0.8, amplitude: 0.025, axis: 'z' });
  }
  for (const x of [3.5, 4.55, 5.6, 6.65]) {
    const bowl = cylinder(context, root, 0.22, 0.18, [x, 1.48, -1.25], '#efe1bc', 12);
    bowl.scale.y = 0.55;
    const steam = glowPanel(context, root, [0.035, 0.48, 0.035], [x, 1.88, -1.25], '#ffe5b3');
    steam.material.transparent = true;
    steam.material.opacity = 0.34;
    animated.push({ object: steam, phase: x, speed: 1.5, amplitude: 0.12, axis: 'y' });
  }
  box(context, root, [4.2, 0.13, 0.65], [-2.75, 1.15, -2.72], { color: context.theme.woodLight });
  for (const x of [-4.25, -3.25, -2.25, -1.25]) addChair(context, root, x, -2.05, Math.PI);
  glowPanel(context, root, [3.7, 0.92, 0.08], [4.85, 5.5, -3.08], '#edb95f');
  box(context, root, [3.15, 0.42, 0.05], [4.85, 5.5, -3], { color: context.theme.wallDark, castShadow: false });
}

function arcadeCabinet(context: BuildContext, root: Group, x: number, z: number, color: ColorRepresentation): void {
  const cabinet = new Group();
  cabinet.position.set(x, 0, z);
  root.add(cabinet);
  box(context, cabinet, [1.15, 2.75, 0.86], [0, 1.38, 0], { color: context.theme.wood, metalness: 0.18 });
  box(context, cabinet, [1.28, 0.78, 1.03], [0, 2.45, 0.02], { color: context.theme.ink });
  glowPanel(context, cabinet, [0.82, 0.62, 0.05], [0, 2.47, 0.54], color);
  glowPanel(context, cabinet, [0.88, 0.11, 0.05], [0, 1.72, 0.55], color);
  cylinder(context, cabinet, 0.08, 0.2, [-0.25, 1.6, 0.63], color, 8);
}

function buildArcade(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  addTable(context, root, -3.55, 1.55, 2.25);
  addTable(context, root, -0.5, 1.55, 2.25);
  for (const x of [-4.15, -2.95, -1.1, 0.1]) addChair(context, root, x, 2.38, Math.PI);
  for (const [index, x] of [-5.15, -3.65, -2.15].entries()) arcadeCabinet(context, root, x, -1.55, index % 2 ? context.theme.accent : context.theme.neon);
  box(context, root, [5.25, 1.12, 1.45], [5.2, 0.56, -1.45], { color: context.theme.wood });
  box(context, root, [5.5, 0.16, 1.58], [5.1, 1.22, -1.45], { color: context.theme.metal, metalness: 0.38 });
  for (const x of [3.5, 5.05, 6.6]) glowPanel(context, root, [1.05, 0.55, 0.06], [x, 2.02, -1.12], x === 5.05 ? context.theme.accent : context.theme.neon);
  glowPanel(context, root, [6.2, 0.08, 0.08], [4.7, 5.45, -3.08], context.theme.neon);
  glowPanel(context, root, [4.7, 0.08, 0.08], [5.25, 4.65, -3.08], context.theme.accent);
  const sign = glowPanel(context, root, [3.8, 0.72, 0.08], [4.85, 5.1, -3], context.theme.neon);
  animated.push({ object: sign, phase: 1, speed: 3.2, amplitude: 0.025, axis: 'y' });
}

export function buildVenue(venue: VenueKind): DioramaSet {
  const root = new Group();
  root.name = `diorama:${venue}`;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const theme = DIORAMA_THEMES[venue];
  const context: BuildContext = { geometries, materials, theme };
  const animatedProps: AnimatedProp[] = [];
  const shell = buildShell(context, root);

  if (venue === 'cafe') buildCafe(context, root, animatedProps);
  else if (venue === 'ramen') buildRamen(context, root, animatedProps);
  else buildArcade(context, root, animatedProps);

  const pendants = venue === 'arcade'
    ? [addPendant(context, root, -3.1, 0.1, theme.neon), addPendant(context, root, 0.2, 0.1, theme.accent), addPendant(context, root, 4.65, -1, theme.neon)]
    : venue === 'ramen'
      ? [addPendant(context, root, -3.6, 0.5, theme.neon), addPendant(context, root, -0.4, 0.5, theme.neon), addPendant(context, root, 4.9, -1.25, theme.neon)]
      : [addPendant(context, root, -3.6, 0.5, theme.glow), addPendant(context, root, -0.4, 0.5, theme.glow), addPendant(context, root, 4.9, -1.25, theme.glow)];

  return {
    root,
    doorPivot: shell.doorPivot,
    practicalLights: pendants.map((pendant) => pendant.light),
    floorMaterial: shell.floorMaterial,
    exteriorMaterials: shell.exteriorMaterials,
    lightPools: pendants.map((pendant) => pendant.pool),
    animatedProps,
    theme,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials) entry.dispose();
      root.removeFromParent();
    },
  };
}
