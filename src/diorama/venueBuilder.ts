import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SpotLight,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Object3D,
} from 'three';
import type { VenueKind } from '../venue';
import {
  VENUE_LAYOUTS,
  type SeatedActivitySpot,
  type SeatOrientation,
  type VenueLayout,
} from '../simulation/layout';
import {
  DIORAMA,
  DIORAMA_THEMES,
  type AnimatedProp,
  type DioramaPoint,
  type DioramaSet,
  type DioramaTheme,
  type FocusOccluder,
  type FocusOccluderKind,
  type SeatAlignmentReport,
  type SeatVisualBinding,
  type SeatVisualKind,
  worldToDiorama,
} from './types';
import { PixelSurfaceLibrary } from './pixelSurfaceLibrary';
import { VENUE_VISUAL_PROFILES, type SurfaceKind, type VenueVisualProfile } from './visualProfiles';
import { countSelectiveBloomSurfaces, registerSelectiveBloomSurface } from './selectiveBloom';
import { batchStaticVenuePrimitives } from './venueBatching';

interface BuildContext {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly theme: DioramaTheme;
  readonly profile: VenueVisualProfile;
  readonly surfaces: PixelSurfaceLibrary;
  readonly usedSurfaceKinds: Set<SurfaceKind>;
  readonly surfaceMaterials: Map<SurfaceKind, MeshStandardMaterial[]>;
  readonly geometryCache: Map<string, BufferGeometry>;
  readonly materialCache: Map<string, MeshStandardMaterial>;
  readonly focusOccluders: FocusOccluder[];
  readonly seatBindings: SeatVisualBinding[];
  focusOccluderSerial: number;
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
  readonly surface?: SurfaceKind;
}

const SEAT_ROTATIONS: Readonly<Record<SeatOrientation, number>> = {
  left: -Math.PI / 2,
  right: Math.PI / 2,
  front: 0,
  radial: 0,
};

export function rotationForSeatOrientation(orientation: SeatOrientation): number {
  return SEAT_ROTATIONS[orientation];
}

export function forwardAxisForSeatOrientation(orientation: SeatOrientation): DioramaPoint {
  if (orientation === 'left') return { x: -1, z: 0 };
  if (orientation === 'right') return { x: 1, z: 0 };
  if (orientation === 'front') return { x: 0, z: 1 };
  return { x: 0, z: 0 };
}

function material(context: BuildContext, options: BoxOptions): MeshStandardMaterial {
  const surfaceKind = options.surface ?? 'wood';
  const recipe = context.profile.surfaces[surfaceKind];
  const key = JSON.stringify([
    surfaceKind,
    String(options.color ?? context.theme.wood),
    String(options.emissive ?? '#000000'),
    options.emissiveIntensity ?? 0,
    options.roughness ?? recipe.roughness,
    options.metalness ?? recipe.metalness,
  ]);
  const cached = context.materialCache.get(key);
  if (cached) return cached;
  const result = new MeshStandardMaterial({
    color: options.color ?? context.theme.wood,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
    roughness: options.roughness ?? recipe.roughness,
    metalness: options.metalness ?? recipe.metalness,
    map: context.surfaces.get(surfaceKind),
  });
  result.userData.surfaceKind = surfaceKind;
  result.userData.sharedMaterialKey = key;
  context.usedSurfaceKinds.add(surfaceKind);
  const registered = context.surfaceMaterials.get(surfaceKind) ?? [];
  registered.push(result);
  context.surfaceMaterials.set(surfaceKind, registered);
  context.materials.add(result);
  context.materialCache.set(key, result);
  return result;
}

function sharedGeometry<T extends BufferGeometry>(context: BuildContext, key: string, create: () => T): T {
  const cached = context.geometryCache.get(key);
  if (cached) return cached as T;
  const geometry = create();
  geometry.userData.staticGeometryKey = key;
  context.geometryCache.set(key, geometry);
  context.geometries.add(geometry);
  return geometry;
}

function box(
  context: BuildContext,
  parent: Object3D,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  options: BoxOptions = {},
): Mesh<BoxGeometry, MeshStandardMaterial> {
  const geometry = sharedGeometry(context, 'box:unit', () => new BoxGeometry(1, 1, 1));
  const mesh = new Mesh(geometry, material(context, options));
  mesh.position.set(...position);
  mesh.scale.set(...size);
  mesh.userData.staticPrimitiveKind = 'box';
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addContactShadow(
  context: BuildContext,
  parent: Object3D,
  width: number,
  depth: number,
  x = 0,
  z = 0,
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const geometry = sharedGeometry(context, 'plane:unit', () => new PlaneGeometry(1, 1));
  const shadowMaterial = new MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: DoubleSide,
  });
  context.materials.add(shadowMaterial);
  const shadow = new Mesh(geometry, shadowMaterial);
  shadow.name = 'seat-contact-shadow';
  shadow.userData.overhang = 0.08;
  shadow.position.set(x, 0.09, z);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width * 1.08, depth * 1.08, 1);
  shadow.userData.staticPrimitiveKind = 'plane';
  shadow.userData.staticBatchable = false;
  shadow.renderOrder = 1;
  parent.add(shadow);
  return shadow;
}

function bindSeat(
  context: BuildContext,
  spot: SeatedActivitySpot,
  object: Object3D,
  kind: SeatVisualKind,
  seatCenter: DioramaPoint,
  backrestCenter?: DioramaPoint,
): void {
  context.seatBindings.push({
    activitySpotId: spot.id,
    kind,
    orientation: spot.seatOrientation,
    transform: {
      rotation: rotationForSeatOrientation(spot.seatOrientation),
      seatCenter,
      forward: forwardAxisForSeatOrientation(spot.seatOrientation),
      backrestCenter,
    },
    visualRotation: object.rotation.y,
    partNames: (() => {
      const names: string[] = [];
      object.traverse((entry) => { if (entry.name) names.push(entry.name); });
      return names;
    })(),
    contactShadow: (() => {
      let result: SeatVisualBinding['contactShadow'];
      object.traverse((entry) => {
        if (!(entry instanceof Mesh) || entry.name !== 'seat-contact-shadow' || !(entry.material instanceof MeshBasicMaterial)) return;
        result = {
          overhang: Number(entry.userData.overhang ?? 0),
          opacity: entry.material.opacity,
          transparent: entry.material.transparent,
          depthWrite: entry.material.depthWrite,
        };
      });
      return result;
    })(),
  });
}

function rotationDelta(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

export function validateSeatAlignment(
  layout: VenueLayout,
  bindings: readonly SeatVisualBinding[],
): SeatAlignmentReport {
  const issues: string[] = [];
  const seatedSpots = layout.activitySpots.filter((spot): spot is SeatedActivitySpot => spot.pose === 'seated');
  const bindingsBySpot = new Map<string, SeatVisualBinding[]>();
  for (const binding of bindings) {
    const entries = bindingsBySpot.get(binding.activitySpotId) ?? [];
    entries.push(binding);
    bindingsBySpot.set(binding.activitySpotId, entries);
  }

  for (const spot of seatedSpots) {
    const matches = bindingsBySpot.get(spot.id) ?? [];
    if (matches.length === 0) issues.push(`missing-binding:${spot.id}`);
    if (matches.length > 1) issues.push(`duplicate-binding:${spot.id}`);
  }

  for (const binding of bindings) {
    const spot = layout.activitySpots.find((entry) => entry.id === binding.activitySpotId);
    if (!spot) {
      issues.push(`unknown-binding:${binding.activitySpotId}`);
      continue;
    }
    if (spot.pose !== 'seated') {
      issues.push(`standing-binding:${binding.activitySpotId}`);
      continue;
    }
    if (binding.orientation !== spot.seatOrientation) issues.push(`orientation:${spot.id}`);

    const guestAnchor = worldToDiorama(spot);
    if (Math.hypot(binding.transform.seatCenter.x - guestAnchor.x, binding.transform.seatCenter.z - guestAnchor.z) > 0.8) {
      issues.push(`anchor-distance:${spot.id}`);
    }

    if (spot.seatOrientation === 'radial') continue;
    const expectedRotation = rotationForSeatOrientation(spot.seatOrientation);
    const expectedForward = forwardAxisForSeatOrientation(spot.seatOrientation);
    if (rotationDelta(binding.transform.rotation, expectedRotation) > 0.001) issues.push(`rotation:${spot.id}`);
    if (rotationDelta(binding.visualRotation, expectedRotation) > 0.001) issues.push(`visual-rotation:${spot.id}`);
    if (Math.hypot(binding.transform.forward.x - expectedForward.x, binding.transform.forward.z - expectedForward.z) > 0.001) {
      issues.push(`forward-axis:${spot.id}`);
    }
    if (!binding.transform.backrestCenter) {
      issues.push(`missing-backrest:${spot.id}`);
      continue;
    }
    const backrestOffsetX = binding.transform.backrestCenter.x - guestAnchor.x;
    const backrestOffsetZ = binding.transform.backrestCenter.z - guestAnchor.z;
    if (backrestOffsetX * expectedForward.x + backrestOffsetZ * expectedForward.z >= -0.05) {
      issues.push(`backrest-position:${spot.id}`);
    }
  }

  return {
    venue: layout.venue,
    valid: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 8),
    bindingCount: bindings.length,
    seatedSpotCount: seatedSpots.length,
    issues,
  };
}

function cylinder(
  context: BuildContext,
  parent: Object3D,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  color: ColorRepresentation,
  sides = 12,
  surfaceKind: SurfaceKind = 'wood',
): Mesh<CylinderGeometry, MeshStandardMaterial> {
  const geometry = sharedGeometry(context, `cylinder:unit:${sides}`, () => new CylinderGeometry(1, 1.05, 1, sides));
  const mesh = new Mesh(geometry, material(context, { color, roughness: 0.66, surface: surfaceKind }));
  mesh.position.set(...position);
  mesh.scale.set(radius, height, radius);
  mesh.userData.staticPrimitiveKind = 'cylinder';
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
  const panel = box(context, parent, size, position, {
    color,
    emissive: color,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    surface: 'emissive',
  });
  registerSelectiveBloomSurface(panel);
  return panel;
}

function markFocusOccluder(context: BuildContext, object: Object3D, kind: FocusOccluderKind): void {
  context.focusOccluderSerial += 1;
  object.userData.staticBatchScope = `focus:${kind}:${context.focusOccluderSerial}`;
  const replacements = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const occluderMaterials = new Set<MeshStandardMaterial>();
  object.traverse((entry) => {
    if (entry instanceof Mesh) {
      const entries = Array.isArray(entry.material) ? entry.material : [entry.material];
      const replaced = entries.map((entryMaterial) => {
        if (!(entryMaterial instanceof MeshStandardMaterial)) return entryMaterial;
        let replacement = replacements.get(entryMaterial);
        if (!replacement) {
          replacement = entryMaterial.clone();
          replacement.userData = { ...entryMaterial.userData, sharedMaterialKey: `focus:${kind}:${context.focusOccluderSerial}:${entryMaterial.uuid}` };
          replacements.set(entryMaterial, replacement);
          context.materials.add(replacement);
          const surfaceKind = replacement.userData.surfaceKind as SurfaceKind | undefined;
          if (surfaceKind) {
            const registered = context.surfaceMaterials.get(surfaceKind) ?? [];
            registered.push(replacement);
            context.surfaceMaterials.set(surfaceKind, registered);
          }
        }
        occluderMaterials.add(replacement);
        return replacement;
      });
      entry.material = Array.isArray(entry.material) ? replaced : replaced[0]!;
    }
  });
  context.focusOccluders.push({
    id: `${kind}-${context.focusOccluderSerial}`,
    kind,
    object,
    materials: [...occluderMaterials].map((entry) => ({
      material: entry,
      opacity: entry.opacity,
      transparent: entry.transparent,
      depthWrite: entry.depthWrite,
    })),
  });
}

function addPendant(
  context: BuildContext,
  root: Group,
  x: number,
  z: number,
  color: ColorRepresentation,
): PendantParts {
  box(context, root, [0.06, 2.05, 0.06], [x, 7.65, z], { color: context.theme.ink, castShadow: false, surface: 'metal' });
  const shade = cylinder(context, root, 0.28, 0.26, [x, 6.55, z], context.theme.woodLight, 8, 'metal');
  shade.rotation.x = Math.PI;
  glowPanel(context, root, [0.35, 0.06, 0.35], [x, 6.39, z], color);
  const light = new SpotLight(color, 20, 11, Math.PI / 4.5, 0.72, 1.15);
  light.userData.baseColor = color;
  light.position.set(x, 6.34, z);
  light.target.position.set(x, 0, z + 0.4);
  light.castShadow = false;
  root.add(light, light.target);
  const poolGeometry = sharedGeometry(context, 'circle:unit:32', () => new CircleGeometry(1, 32));
  const poolMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
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
  const table = new Group();
  table.name = 'focus-occluder:table';
  root.add(table);
  box(context, table, [width, 0.15, 0.92], [x, 0.84, z], { color: context.theme.woodLight, roughness: 0.72, surface: 'wood' });
  box(context, table, [width - 0.12, 0.08, 0.74], [x, 0.94, z], { color: context.theme.wood, roughness: 0.65, surface: 'wood' });
  for (const legX of [x - width * 0.34, x + width * 0.34]) {
    box(context, table, [0.16, 0.78, 0.16], [legX, 0.4, z], { color: context.theme.wood });
  }
  markFocusOccluder(context, table, 'table');
}

function addChair(context: BuildContext, root: Group, spot: SeatedActivitySpot): void {
  const point = worldToDiorama(spot);
  const rotation = rotationForSeatOrientation(spot.seatOrientation);
  const forward = forwardAxisForSeatOrientation(spot.seatOrientation);
  const chair = new Group();
  chair.name = `focus-occluder:chair:${spot.id}`;
  chair.position.set(point.x, 0, point.z);
  chair.rotation.y = rotation;
  root.add(chair);
  const seat = box(context, chair, [0.74, 0.12, 0.68], [0, 0.52, 0], { color: context.theme.wood });
  seat.name = `seat-surface:${spot.id}`;
  for (const x of [-0.27, 0.27]) {
    const slat = box(context, chair, [0.1, 0.74, 0.1], [x, 0.94, -0.29], { color: context.theme.wood });
    slat.name = `seat-backrest-slat:${spot.id}`;
  }
  const topRail = box(context, chair, [0.74, 0.12, 0.12], [0, 1.27, -0.29], { color: context.theme.wood });
  topRail.name = `seat-backrest-rail:${spot.id}`;
  for (const dx of [-0.27, 0.27]) {
    for (const dz of [-0.23, 0.23]) box(context, chair, [0.09, 0.5, 0.09], [dx, 0.25, dz], { color: context.theme.ink });
  }
  addContactShadow(context, chair, 0.74, 0.68);
  bindSeat(context, spot, chair, 'chair', point, {
    x: point.x - forward.x * 0.29,
    z: point.z - forward.z * 0.29,
  });
  markFocusOccluder(context, chair, 'chair');
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

function addStool(context: BuildContext, root: Group, spot: SeatedActivitySpot): void {
  const point = worldToDiorama(spot);
  const stool = new Group();
  stool.name = `focus-occluder:chair:${spot.id}`;
  root.add(stool);
  const seat = cylinder(context, stool, 0.36, 0.12, [point.x, 0.58, point.z], context.theme.woodLight, 12);
  seat.name = `seat-surface:${spot.id}`;
  seat.castShadow = false;
  const stem = cylinder(context, stool, 0.08, 0.55, [point.x, 0.28, point.z], context.theme.ink, 8);
  stem.castShadow = false;
  addContactShadow(context, stool, 0.72, 0.72, point.x, point.z);
  bindSeat(context, spot, stool, 'stool', point);
  markFocusOccluder(context, stool, 'chair');
}

function addExterior(context: BuildContext, root: Group): readonly MeshStandardMaterial[] {
  const outside = new Group();
  outside.position.z = -3.78;
  root.add(outside);
  const exteriorMaterials: MeshStandardMaterial[] = [];
  const city = box(context, outside, [15.7, 7.1, 0.08], [0, 4.15, 0], { color: '#668aa4', castShadow: false, surface: 'glass' });
  exteriorMaterials.push(city.material);
  const skyline = ['#273448', '#354157', '#1e2b42', '#3a4557'];
  for (let index = 0; index < 19; index += 1) {
    const width = 0.5 + (index % 3) * 0.16;
    const height = 1.3 + ((index * 7) % 5) * 0.48;
    const x = -7.2 + index * 0.8;
    const building = box(context, outside, [width, height, 0.12], [x, 1.1 + height / 2, 0.06], {
      color: skyline[index % skyline.length], castShadow: false, surface: 'plaster',
    });
    exteriorMaterials.push(building.material);
    if (index % 2 === 0) glowPanel(context, outside, [0.12, 0.16, 0.03], [x, 1.2 + height * 0.7, 0.14], '#e6bd75');
  }
  return exteriorMaterials;
}

function addDoor(context: BuildContext, root: Group, venue: VenueKind): Group {
  const layout = VENUE_LAYOUTS[venue];
  const mapped = worldToDiorama(layout.entrance);
  const doorPivot = new Group();
  const closedRotation = layout.entryFlow === 'left' ? Math.PI / 2 : layout.entryFlow === 'right' ? -Math.PI / 2 : 0;
  doorPivot.position.set(mapped.x, 0.1, mapped.z);
  doorPivot.rotation.y = closedRotation;
  doorPivot.userData.closedRotation = closedRotation;
  doorPivot.userData.staticBatchBoundary = true;
  root.add(doorPivot);
  box(context, doorPivot, [1.42, 3.75, 0.18], [0.71, 1.88, 0], { color: context.theme.wood, roughness: 0.65, surface: 'wood' });
  box(context, doorPivot, [1.08, 2.65, 0.08], [0.71, 2.28, 0.11], { color: context.theme.wallDark, roughness: 0.3, surface: 'glass' });
  glowPanel(context, doorPivot, [0.12, 0.12, 0.15], [1.27, 1.83, 0.18], context.theme.glow);
  if (layout.entryFlow === 'rear') {
    box(context, root, [1.72, 0.2, 0.34], [mapped.x + 0.71, 3.94, mapped.z], { color: context.theme.woodLight });
  } else {
    box(context, root, [0.34, 0.2, 1.72], [mapped.x, 3.94, mapped.z + (layout.entryFlow === 'left' ? 0.71 : -0.71)], { color: context.theme.woodLight });
  }
  return doorPivot;
}

function addSideWall(context: BuildContext, root: Group, venue: VenueKind, side: 'left' | 'right'): void {
  const layout = VENUE_LAYOUTS[venue];
  const hasDoor = layout.entryFlow === side;
  const x = side === 'left' ? -8.12 : 8.12;
  if (!hasDoor) {
    box(context, root, [0.25, DIORAMA.height, DIORAMA.depth], [x, 4.35, 0], { color: context.theme.wallDark, surface: 'plaster' });
    return;
  }
  const doorZ = worldToDiorama(layout.entrance).z;
  const halfOpening = 0.82;
  const backLength = doorZ - halfOpening + DIORAMA.depth / 2;
  const frontLength = DIORAMA.depth / 2 - (doorZ + halfOpening);
  if (backLength > 0) box(context, root, [0.25, DIORAMA.height, backLength], [x, 4.35, -DIORAMA.depth / 2 + backLength / 2], { color: context.theme.wallDark, surface: 'plaster' });
  if (frontLength > 0) box(context, root, [0.25, DIORAMA.height, frontLength], [x, 4.35, doorZ + halfOpening + frontLength / 2], { color: context.theme.wallDark, surface: 'plaster' });
  box(context, root, [0.25, 4.55, 1.64], [x, 6.52, doorZ], { color: context.theme.wallDark, surface: 'plaster' });
}

function addCafeWindow(context: BuildContext, root: Group): void {
  box(context, root, [2.1, 8.5, 0.22], [-6.95, 4.25, -3.52], { color: context.theme.wall, surface: 'plaster' });
  box(context, root, [3.0, 8.5, 0.22], [6.5, 4.25, -3.52], { color: context.theme.wall, surface: 'plaster' });
  box(context, root, [10.9, 1.5, 0.22], [-0.45, 0.75, -3.52], { color: context.theme.wall, surface: 'plaster' });
  box(context, root, [10.9, 1.2, 0.22], [-0.45, 7.9, -3.52], { color: context.theme.wallDark, surface: 'plaster' });
  const geometry = sharedGeometry(context, 'plane:unit', () => new PlaneGeometry(1, 1));
  const glassMaterial = new MeshStandardMaterial({
    color: '#9fc0ca', transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0,
    depthWrite: false, side: DoubleSide,
    map: context.surfaces.get('glass'),
  });
  glassMaterial.userData.surfaceKind = 'glass';
  context.usedSurfaceKinds.add('glass');
  context.materials.add(glassMaterial);
  const glass = new Mesh(geometry, glassMaterial);
  glass.position.set(-0.45, 4.35, -3.39);
  glass.scale.set(10.6, 6.4, 1);
  glass.userData.staticPrimitiveKind = 'plane';
  glass.userData.staticBatchable = false;
  root.add(glass);
  for (const x of [-4.2, -0.45, 3.3]) box(context, root, [0.18, 6.55, 0.26], [x, 4.3, -3.32], { color: context.theme.wallDark });
  box(context, root, [10.9, 0.22, 0.32], [-0.45, 1.5, -3.28], { color: context.theme.woodLight });
  box(context, root, [10.9, 0.22, 0.32], [-0.45, 7.2, -3.28], { color: context.theme.woodLight });
}

function buildShell(context: BuildContext, root: Group, venue: VenueKind): ShellParts {
  box(context, root, [DIORAMA.width + 0.8, 0.32, DIORAMA.depth + 0.8], [0, -0.23, 0], { color: context.theme.ink, roughness: 0.88, surface: 'floor' });
  const floor = box(context, root, [DIORAMA.width, 0.16, DIORAMA.depth], [0, 0, 0], {
    color: context.theme.floor, roughness: venue === 'arcade' ? 0.28 : 0.55, metalness: venue === 'arcade' ? 0.24 : 0.08, surface: 'floor',
  });
  for (let index = -7; index <= 7; index += 1) {
    const strip = box(context, root, [0.035, 0.018, DIORAMA.depth - 0.2], [index + 0.5, 0.095, 0], {
      color: context.theme.floorLine, emissive: venue === 'arcade' && index % 3 === 0 ? context.theme.floorLine : '#000000',
      emissiveIntensity: venue === 'arcade' && index % 3 === 0 ? 0.45 : 0, castShadow: false,
      surface: venue === 'arcade' && index % 3 === 0 ? 'emissive' : 'floor',
    });
    strip.rotation.y = venue === 'cafe' ? -0.08 : 0;
  }
  const exteriorMaterials = addExterior(context, root);
  addSideWall(context, root, venue, 'left');
  addSideWall(context, root, venue, 'right');
  if (venue === 'cafe') addCafeWindow(context, root);
  else if (venue === 'arcade') {
    box(context, root, [7.2, 8.5, 0.22], [-4.4, 4.25, -3.52], { color: context.theme.wall, surface: 'plaster' });
    box(context, root, [7.2, 8.5, 0.22], [4.4, 4.25, -3.52], { color: context.theme.wall, surface: 'plaster' });
    box(context, root, [1.6, 4.55, 0.22], [0, 6.52, -3.52], { color: context.theme.wallDark, surface: 'plaster' });
  } else {
    box(context, root, [DIORAMA.width, 8.5, 0.22], [0, 4.25, -3.52], { color: context.theme.wall, surface: venue === 'ramen' ? 'tile' : 'plaster' });
  }
  return { doorPivot: addDoor(context, root, venue), floorMaterial: floor.material, exteriorMaterials };
}

function buildCafe(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  const bench = new Group();
  bench.name = 'focus-occluder:chair:cafe-window';
  root.add(bench);
  const benchSeat = box(context, bench, [4.7, 0.22, 0.62], [-3.18, 0.56, -1.78], { color: context.theme.woodLight });
  benchSeat.name = 'seat-surface:cafe-window';
  const benchBackrest = box(context, bench, [4.7, 0.92, 0.18], [-3.18, 1.04, -2.02], { color: context.theme.wood });
  benchBackrest.name = 'seat-backrest:cafe-window';
  addContactShadow(context, bench, 4.7, 0.62, -3.18, -1.78);
  for (const spot of VENUE_LAYOUTS.cafe.activitySpots) {
    if (spot.pose !== 'seated' || spot.kind !== 'bench') continue;
    const point = worldToDiorama(spot);
    bindSeat(context, spot, bench, 'bench', { x: point.x, z: -1.78 }, { x: point.x, z: -2.02 });
  }
  markFocusOccluder(context, bench, 'chair');
  addTable(context, root, -2.96, 0.92, 2.45);
  addTable(context, root, 0.24, 1.67, 2.7);
  for (const spot of VENUE_LAYOUTS.cafe.activitySpots) {
    if (spot.pose === 'seated' && spot.kind === 'table') addChair(context, root, spot);
  }
  const counter = new Group();
  counter.name = 'focus-occluder:counter';
  root.add(counter);
  box(context, counter, [4.4, 1.18, 1.15], [5.55, 0.6, -2.06], { color: context.theme.wood });
  box(context, counter, [4.65, 0.16, 1.36], [5.48, 1.28, -2.06], { color: context.theme.woodLight });
  markFocusOccluder(context, counter, 'counter');
  const machine = new Group();
  root.add(machine);
  box(context, machine, [1.05, 1.05, 0.62], [6.2, 1.88, -2.12], { color: context.theme.metal, metalness: 0.72, roughness: 0.27, surface: 'metal' });
  glowPanel(context, machine, [0.3, 0.18, 0.04], [6.2, 2.04, -1.79], '#e6b86c');
  markFocusOccluder(context, machine, 'machine');
  const cakeCase = new Group();
  root.add(cakeCase);
  box(context, cakeCase, [1.2, 0.72, 0.84], [2.68, 0.45, -1.7], { color: '#d9b68a', roughness: 0.32, surface: 'glass' });
  box(context, cakeCase, [1.05, 0.06, 0.72], [2.68, 0.68, -1.66], { color: '#fff2d2', surface: 'glass', castShadow: false });
  for (const x of [2.35, 2.68, 3.01]) cylinder(context, cakeCase, 0.14, 0.13, [x, 0.93, -1.52], '#d88a5d', 12, 'tile');
  markFocusOccluder(context, cakeCase, 'counter');
  addPlant(context, root, 2.1, 0.05, -2.85);
  addPlant(context, root, -6.15, 0.05, 2.7);
  const cup = cylinder(context, root, 0.13, 0.24, [-2.95, 1.15, 0.9], '#ece0bd', 12);
  animated.push({ object: cup, phase: 0.2, speed: 1.1, amplitude: 0.025, axis: 'y' });
}

function buildRamen(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  const counter = new Group();
  counter.name = 'focus-occluder:counter';
  root.add(counter);
  box(context, counter, [10.2, 1.16, 1.0], [-1.02, 0.58, -2.02], { color: context.theme.wood });
  box(context, counter, [10.45, 0.16, 1.18], [-1.02, 1.25, -2.02], { color: context.theme.woodLight });
  markFocusOccluder(context, counter, 'counter');
  for (const spot of VENUE_LAYOUTS.ramen.activitySpots.filter((entry) => entry.kind === 'counter-stool')) {
    if (spot.pose !== 'seated') continue;
    const point = worldToDiorama(spot);
    addStool(context, root, spot);
    const bowl = cylinder(context, root, 0.2, 0.17, [point.x, 1.45, -1.75], '#efe1bc', 12, 'tile');
    bowl.scale.y = 0.55;
    const steam = glowPanel(context, root, [0.035, 0.48, 0.035], [point.x, 1.84, -1.75], '#ffe5b3');
    steam.material.transparent = true;
    steam.material.opacity = 0.34;
    animated.push({ object: steam, phase: point.x, speed: 1.5, amplitude: 0.12, axis: 'y' });
  }
  addTable(context, root, 5.25, 0.58, 1.35);
  for (const spot of VENUE_LAYOUTS.ramen.activitySpots.filter((entry) => entry.kind === 'table')) {
    if (spot.pose === 'seated') addChair(context, root, spot);
  }
  box(context, root, [11.5, 0.2, 0.25], [-0.45, 4.35, -3.18], { color: context.theme.woodLight });
  box(context, root, [11.7, 1.55, 0.09], [-0.45, 2.75, -3.24], { color: '#8ba8ad', surface: 'tile', castShadow: false });
  box(context, root, [3.25, 1.28, 0.22], [-4.5, 2.75, -3.04], { color: context.theme.metal, surface: 'metal', metalness: 0.8 });
  for (const x of [-5.55, -4.8, -4.05, -3.3]) cylinder(context, root, 0.22, 0.38, [x, 1.58, -2.78], '#d8e3df', 12, 'metal');
  for (const x of [-5.5, -3.65, -1.8, 0.05, 1.9, 3.75]) {
    const cloth = box(context, root, [1.42, 1.35, 0.07], [x, 3.58, -3.1], { color: context.theme.accent, castShadow: false });
    animated.push({ object: cloth, phase: x, speed: 0.8, amplitude: 0.025, axis: 'z' });
  }
  glowPanel(context, root, [4.6, 0.82, 0.08], [-0.45, 5.5, -3.08], '#edb95f');
  box(context, root, [3.95, 0.38, 0.05], [-0.45, 5.5, -3], { color: context.theme.wallDark, castShadow: false });
  for (const x of [-6.2, -5.7, -5.2]) cylinder(context, root, 0.18, 0.4, [x, 1.55, -2.8], x === -5.7 ? '#d35e4d' : '#efe1bc', 12, 'tile');
}

function arcadeCabinet(
  context: BuildContext,
  root: Group,
  x: number,
  z: number,
  rotation: number,
  color: ColorRepresentation,
): void {
  const cabinet = new Group();
  cabinet.name = 'focus-occluder:machine';
  cabinet.position.set(x, 0, z);
  cabinet.rotation.y = rotation;
  root.add(cabinet);
  box(context, cabinet, [1.15, 2.75, 0.86], [0, 1.38, 0], { color: context.theme.wood, metalness: 0.18, surface: 'metal' });
  box(context, cabinet, [1.28, 0.78, 1.03], [0, 2.45, 0.02], { color: context.theme.ink, surface: 'metal' });
  glowPanel(context, cabinet, [0.82, 0.62, 0.05], [0, 2.47, 0.54], color);
  box(context, cabinet, [1.02, 0.18, 0.58], [0, 1.71, 0.46], { color: context.theme.metal, metalness: 0.5, surface: 'metal' });
  glowPanel(context, cabinet, [0.88, 0.08, 0.05], [0, 1.8, 0.57], color);
  cylinder(context, cabinet, 0.08, 0.2, [-0.25, 1.66, 0.68], '#f1d477', 8, 'emissive');
  cylinder(context, cabinet, 0.06, 0.14, [0.2, 1.67, 0.68], color, 8, 'emissive');
  markFocusOccluder(context, cabinet, 'machine');
}

function buildArcade(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  const cabinetColliders = VENUE_LAYOUTS.arcade.colliders.filter((collider) => collider.id.includes('cabinet'));
  for (const [index, collider] of cabinetColliders.entries()) {
    const point = worldToDiorama({ x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 });
    const left = collider.id.includes('left');
    arcadeCabinet(context, root, point.x, point.z, left ? Math.PI / 2 : -Math.PI / 2, index % 2 ? context.theme.accent : context.theme.neon);
  }
  const counter = new Group();
  counter.name = 'focus-occluder:counter';
  root.add(counter);
  box(context, counter, [2.45, 1.1, 0.9], [3.12, 0.55, -2.9], { color: context.theme.wood });
  box(context, counter, [2.65, 0.16, 1.08], [3.12, 1.18, -2.9], { color: context.theme.metal, metalness: 0.42 });
  for (const x of [2.55, 3.12, 3.69]) glowPanel(context, counter, [0.3, 0.22, 0.04], [x, 1.42, -2.43], x === 3.12 ? context.theme.accent : context.theme.neon);
  markFocusOccluder(context, counter, 'counter');
  const lounge = new Group();
  lounge.name = 'focus-occluder:chair:arcade-lounge';
  root.add(lounge);
  const loungeSeat = box(context, lounge, [3.1, 0.34, 0.72], [0, 0.26, 2.18], { color: context.theme.woodLight });
  loungeSeat.name = 'seat-surface:arcade-lounge';
  const loungeBackrest = box(context, lounge, [3.1, 0.62, 0.18], [0, 0.56, 1.88], { color: context.theme.wood });
  loungeBackrest.name = 'seat-backrest:arcade-lounge';
  const loungeEdge = box(context, lounge, [3.1, 0.055, 0.04], [0, 0.45, 2.55], {
    color: '#5cdade', emissive: '#5cdade', emissiveIntensity: 0.28, roughness: 0.5, castShadow: false, surface: 'emissive',
  });
  loungeEdge.name = 'seat-edge:arcade-lounge';
  registerSelectiveBloomSurface(loungeEdge);
  addContactShadow(context, lounge, 3.1, 0.72, 0, 2.18);
  const loungeSpot = VENUE_LAYOUTS.arcade.activitySpots.find((spot) => spot.id === 'arcade-lounge');
  if (loungeSpot?.pose === 'seated') {
    bindSeat(context, loungeSpot, lounge, 'bench', { x: 0, z: 2.18 }, { x: 0, z: 1.88 });
  }
  markFocusOccluder(context, lounge, 'chair');
  for (const x of [-2.1, 0, 2.1]) glowPanel(context, root, [1.4, 0.035, 0.08], [x, 0.115, 0.35], x === 0 ? context.theme.accent : context.theme.neon);
  for (const [x, color] of [[-4.8, context.theme.neon], [4.8, context.theme.accent]] as const) {
    box(context, root, [1.5, 1.9, 0.06], [x, 4.15, -3.24], { color: context.theme.wallDark, surface: 'plaster', castShadow: false });
    for (let pixelIndex = 0; pixelIndex < 5; pixelIndex += 1) {
      glowPanel(context, root, [0.2 + (pixelIndex % 2) * 0.18, 0.18, 0.035], [
        x - 0.42 + (pixelIndex % 3) * 0.38,
        3.75 + Math.floor(pixelIndex / 3) * 0.42,
        -3.17,
      ], color);
    }
  }
  glowPanel(context, root, [6.2, 0.08, 0.08], [0, 5.55, -3.08], context.theme.neon);
  const sign = glowPanel(context, root, [3.8, 0.72, 0.08], [0, 5.05, -3], context.theme.accent);
  animated.push({ object: sign, phase: 1, speed: 3.2, amplitude: 0.025, axis: 'y' });
}

export function buildVenue(venue: VenueKind): DioramaSet {
  const root = new Group();
  root.name = `diorama:${venue}`;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const theme = DIORAMA_THEMES[venue];
  const profile = VENUE_VISUAL_PROFILES[venue];
  const surfaces = new PixelSurfaceLibrary(profile.surfaces);
  const usedSurfaceKinds = new Set<SurfaceKind>();
  const surfaceMaterials = new Map<SurfaceKind, MeshStandardMaterial[]>();
  const geometryCache = new Map<string, BufferGeometry>();
  const materialCache = new Map<string, MeshStandardMaterial>();
  const focusOccluders: FocusOccluder[] = [];
  const seatBindings: SeatVisualBinding[] = [];
  const context: BuildContext = {
    geometries, materials, theme, profile, surfaces, usedSurfaceKinds, surfaceMaterials, geometryCache, materialCache,
    focusOccluders, seatBindings, focusOccluderSerial: 0,
  };
  const animatedProps: AnimatedProp[] = [];
  const shell = buildShell(context, root, venue);

  if (venue === 'cafe') buildCafe(context, root, animatedProps);
  else if (venue === 'ramen') buildRamen(context, root, animatedProps);
  else buildArcade(context, root, animatedProps);

  const pendants = venue === 'arcade'
    ? [addPendant(context, root, -3.1, 0.1, theme.neon), addPendant(context, root, 0.2, 0.1, theme.accent), addPendant(context, root, 4.65, -1, theme.neon)]
    : venue === 'ramen'
      ? [
        addPendant(context, root, -3.6, 0.5, profile.lights.fill),
        addPendant(context, root, -0.4, 0.5, profile.lights.fill),
        addPendant(context, root, 4.9, -1.25, profile.lights.practical),
      ]
      : [addPendant(context, root, -3.6, 0.5, theme.glow), addPendant(context, root, -0.4, 0.5, theme.glow), addPendant(context, root, 4.9, -1.25, theme.glow)];

  const availableSurfaceKinds = Object.keys(profile.surfaces) as SurfaceKind[];
  for (const kind of availableSurfaceKinds) surfaces.get(kind);
  const excluded = new Set<Object3D>([
    shell.doorPivot,
    ...animatedProps.map((entry) => entry.object),
  ]);
  const batchedResources = batchStaticVenuePrimitives(root, excluded, geometryCache.size, venue);
  const surfaceTextureBytes = availableSurfaceKinds.reduce((total, kind) => {
    const size = profile.surfaces[kind].size;
    return total + size * size * 4;
  }, 0);

  return {
    root,
    doorPivot: shell.doorPivot,
    practicalLights: pendants.map((pendant) => pendant.light),
    floorMaterial: shell.floorMaterial,
    exteriorMaterials: shell.exteriorMaterials,
    lightPools: pendants.map((pendant) => pendant.pool),
    animatedProps,
    focusOccluders,
    seatBindings,
    theme,
    surfaceTextureCount: surfaces.size,
    surfaceKinds: [...availableSurfaceKinds].sort(),
    surfaceMaterials,
    bloomSurfaceCount: countSelectiveBloomSurfaces(root),
    batchedResources,
    surfaceTextureBytes,
    dispose(): void {
      for (const mesh of batchedResources.meshes) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials) entry.dispose();
      surfaces.dispose();
      root.removeFromParent();
    },
  };
}
