import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Object3D,
  type Texture,
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
import { createPixelLightPoolTexture, PixelSurfaceLibrary } from './pixelSurfaceLibrary';
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
  readonly lightPoolTexture: Texture;
  focusOccluderSerial: number;
}

interface ShellParts {
  readonly doorPivot: Group;
  readonly floorMaterial: MeshStandardMaterial;
  readonly exteriorMaterials: readonly MeshStandardMaterial[];
}

interface PendantParts {
  readonly light: PointLight;
  readonly pool: Mesh<PlaneGeometry, MeshBasicMaterial>;
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
  readonly opacity?: number;
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
    options.opacity ?? 1,
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
    transparent: (options.opacity ?? 1) < 1,
    opacity: options.opacity ?? 1,
    depthWrite: (options.opacity ?? 1) >= 1,
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
  if (context.profile.id === 'ramen') {
    box(context, root, [0.68, 0.54, 0.52], [x, 6.52, z], { color: context.theme.wood, roughness: 0.86, surface: 'wood' });
    glowPanel(context, root, [0.5, 0.38, 0.54], [x, 6.5, z + 0.02], color);
    for (const offset of [-0.22, 0.22]) {
      box(context, root, [0.035, 0.48, 0.57], [x + offset, 6.5, z + 0.03], { color: context.theme.ink, castShadow: false, surface: 'wood' });
    }
  } else {
    const shade = cylinder(context, root, context.profile.id === 'arcade' ? 0.2 : 0.28, 0.26, [x, 6.55, z], context.theme.woodLight, 8, 'metal');
    shade.rotation.x = Math.PI;
    glowPanel(context, root, [context.profile.id === 'arcade' ? 0.24 : 0.35, 0.06, context.profile.id === 'arcade' ? 0.24 : 0.35], [x, 6.39, z], color);
  }
  const light = new PointLight(color, 30, 8.5, 1.65);
  light.userData.baseColor = color;
  light.position.set(x, 6.34, z);
  light.castShadow = false;
  root.add(light);
  const poolGeometry = sharedGeometry(context, 'plane:unit', () => new PlaneGeometry(1, 1));
  const poolMaterial = new MeshBasicMaterial({
    color,
    map: context.lightPoolTexture,
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
  pool.scale.set(4.1, 2.7, 1);
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

function addMug(
  context: BuildContext,
  root: Group,
  x: number,
  y: number,
  z: number,
  color: ColorRepresentation,
): void {
  cylinder(context, root, 0.11, 0.2, [x, y, z], color, 10, 'tile');
  box(context, root, [0.08, 0.09, 0.035], [x + 0.13, y, z], { color, castShadow: false, surface: 'tile' });
}

function addPixelLantern(
  context: BuildContext,
  root: Group,
  x: number,
  y: number,
  z: number,
  color: ColorRepresentation,
  scale = 1,
): void {
  box(context, root, [0.3 * scale, 0.44 * scale, 0.26 * scale], [x, y, z], { color: context.theme.ink, castShadow: false, surface: 'metal' });
  glowPanel(context, root, [0.2 * scale, 0.28 * scale, 0.28 * scale], [x, y, z + 0.015], color);
  for (const offset of [-0.12, 0.12]) {
    box(context, root, [0.025 * scale, 0.48 * scale, 0.3 * scale], [x + offset * scale, y, z], { color: context.theme.ink, castShadow: false, surface: 'metal' });
  }
}

function addWallShelf(
  context: BuildContext,
  root: Group,
  x: number,
  y: number,
  z: number,
  width: number,
  levels: number,
): void {
  for (let level = 0; level < levels; level += 1) {
    const shelfY = y + level * 0.62;
    box(context, root, [width, 0.1, 0.35], [x, shelfY, z], { color: context.theme.woodLight, roughness: 0.78, surface: 'wood' });
    const itemCount = 3 + (level % 2);
    for (let item = 0; item < itemCount; item += 1) {
      const itemX = x - width * 0.38 + item * (width * 0.76 / Math.max(1, itemCount - 1));
      const height = 0.2 + ((item + level) % 3) * 0.07;
      box(context, root, [0.16 + (item % 2) * 0.05, height, 0.18], [itemX, shelfY + 0.08 + height / 2, z + 0.03], {
        color: (item + level) % 3 === 0 ? context.theme.accent : (item + level) % 3 === 1 ? context.theme.metal : context.theme.wood,
        castShadow: false,
        surface: (item + level) % 3 === 1 ? 'metal' : 'wood',
      });
    }
  }
  for (const side of [-1, 1]) box(context, root, [0.1, levels * 0.62, 0.32], [x + side * width / 2, y + (levels - 1) * 0.31, z], { color: context.theme.wood, surface: 'wood' });
}

function addSteamPlume(
  context: BuildContext,
  root: Group,
  animated: AnimatedProp[],
  x: number,
  y: number,
  z: number,
  phase: number,
): void {
  const steam = new Group();
  steam.name = 'authored-steam-plume';
  root.add(steam);
  const wisp = box(context, steam, [0.052, 0.34, 0.052], [x, y + 0.14, z], {
    color: '#d8d2bd', emissive: '#d8d2bd', emissiveIntensity: 0.08, opacity: 0.24,
    castShadow: false, receiveShadow: false, surface: 'emissive',
  });
  wisp.rotation.z = -0.08;
  animated.push({ object: steam, phase, speed: 0.42, amplitude: 0.035, axis: 'y' });
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
  if (venue === 'cafe') {
    for (let index = -7; index <= 7; index += 1) {
      const strip = box(context, root, [0.028, 0.014, DIORAMA.depth - 0.24], [index + 0.5, 0.094, 0], {
        color: context.theme.floorLine, castShadow: false, surface: 'floor',
      });
      strip.rotation.y = -0.045;
    }
    for (let row = -2; row <= 2; row += 1) {
      box(context, root, [3.2, 0.012, 0.026], [row % 2 === 0 ? -3.6 : 3.8, 0.096, row * 1.25], {
        color: context.theme.floorLine, castShadow: false, surface: 'floor',
      });
    }
  } else {
    for (let index = -7; index <= 7; index += 1) {
      box(context, root, [0.022, 0.012, DIORAMA.depth - 0.24], [index + 0.5, 0.094, 0], {
        color: context.theme.floorLine, castShadow: false, surface: 'floor',
      });
    }
    for (let row = -3; row <= 3; row += 1) {
      box(context, root, [DIORAMA.width - 0.2, 0.012, 0.022], [0, 0.096, row + 0.5], {
        color: context.theme.floorLine, castShadow: false, surface: 'floor',
      });
    }
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
  for (const x of [-4.72, -3.18, -1.64]) {
    box(context, bench, [1.35, 0.1, 0.52], [x, 0.72, -1.74], { color: x === -3.18 ? '#5b4938' : '#4a4237', roughness: 0.92, surface: 'plaster' });
  }
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
  for (const x of [3.82, 4.52, 5.22, 5.92, 6.62, 7.32]) {
    box(context, counter, [0.055, 0.86, 1.18], [x, 0.58, -2.04], { color: context.theme.wallDark, castShadow: false, surface: 'wood' });
  }
  markFocusOccluder(context, counter, 'counter');
  const machine = new Group();
  root.add(machine);
  box(context, machine, [1.05, 1.05, 0.62], [6.2, 1.88, -2.12], { color: context.theme.metal, metalness: 0.72, roughness: 0.27, surface: 'metal' });
  glowPanel(context, machine, [0.3, 0.18, 0.04], [6.2, 2.04, -1.79], '#e6b86c');
  for (const x of [5.95, 6.2, 6.45]) {
    box(context, machine, [0.11, 0.08, 0.07], [x, 1.75, -1.77], { color: x === 6.2 ? context.theme.glow : context.theme.ink, castShadow: false, surface: x === 6.2 ? 'emissive' : 'metal' });
  }
  for (const x of [6.03, 6.37]) box(context, machine, [0.035, 0.35, 0.035], [x, 1.36, -1.77], { color: context.theme.metal, surface: 'metal' });
  markFocusOccluder(context, machine, 'machine');
  const cakeCase = new Group();
  root.add(cakeCase);
  box(context, cakeCase, [1.2, 0.72, 0.84], [2.68, 0.45, -1.7], { color: '#d9b68a', roughness: 0.32, surface: 'glass' });
  box(context, cakeCase, [1.05, 0.06, 0.72], [2.68, 0.68, -1.66], { color: '#fff2d2', surface: 'glass', castShadow: false });
  for (const x of [2.35, 2.68, 3.01]) cylinder(context, cakeCase, 0.14, 0.13, [x, 0.93, -1.52], '#d88a5d', 12, 'tile');
  markFocusOccluder(context, cakeCase, 'counter');
  addWallShelf(context, root, -6.75, 2.9, -3.02, 1.45, 3);
  addWallShelf(context, root, 4.82, 3.12, -3.02, 2.75, 2);
  addPixelLantern(context, root, 0.24, 1.28, 1.65, context.theme.glow, 0.78);
  addMug(context, root, -2.7, 1.14, 0.92, '#c6a77c');
  addMug(context, root, -3.2, 1.14, 0.92, '#807862');
  addMug(context, root, -0.35, 1.14, 1.62, '#688078');
  addMug(context, root, 0.72, 1.14, 1.62, '#a57452');
  addPlant(context, root, 2.1, 0.05, -2.85);
  addPlant(context, root, -6.15, 0.05, 2.7);
  const cup = cylinder(context, root, 0.13, 0.24, [-2.95, 1.15, 0.9], '#ece0bd', 12);
  animated.push({ object: cup, phase: 0.2, speed: 1.1, amplitude: 0.025, axis: 'y' });
  addSteamPlume(context, root, animated, -2.95, 1.36, 0.9, 0.2);
}

function buildRamen(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  const counter = new Group();
  counter.name = 'focus-occluder:counter';
  root.add(counter);
  box(context, counter, [10.2, 1.16, 1.0], [-1.02, 0.58, -2.02], { color: context.theme.wood });
  box(context, counter, [10.45, 0.16, 1.18], [-1.02, 1.25, -2.02], { color: context.theme.woodLight });
  for (const x of [-5.5, -3.7, -1.9, -0.1, 1.7, 3.5]) {
    box(context, counter, [0.07, 0.86, 1.02], [x, 0.56, -2.02], { color: context.theme.wallDark, castShadow: false, surface: 'wood' });
  }
  markFocusOccluder(context, counter, 'counter');
  for (const [index, spot] of VENUE_LAYOUTS.ramen.activitySpots.filter((entry) => entry.kind === 'counter-stool').entries()) {
    if (spot.pose !== 'seated') continue;
    const point = worldToDiorama(spot);
    addStool(context, root, spot);
    const bowl = cylinder(context, root, 0.2, 0.17, [point.x, 1.45, -1.75], index % 3 === 0 ? '#b9503d' : index % 3 === 1 ? '#b9a47e' : '#6f8078', 12, 'tile');
    bowl.scale.y = 0.55;
    addSteamPlume(context, root, animated, point.x, 1.62, -1.75, point.x);
  }
  addTable(context, root, 5.25, 0.58, 1.35);
  for (const spot of VENUE_LAYOUTS.ramen.activitySpots.filter((entry) => entry.kind === 'table')) {
    if (spot.pose === 'seated') addChair(context, root, spot);
  }
  box(context, root, [11.5, 0.2, 0.25], [-0.45, 4.35, -3.18], { color: context.theme.woodLight });
  box(context, root, [11.7, 1.55, 0.09], [-0.45, 2.75, -3.24], { color: '#8ba8ad', surface: 'tile', castShadow: false });
  box(context, root, [11.7, 0.14, 0.22], [-0.45, 3.55, -3.12], { color: context.theme.wood, surface: 'wood' });
  box(context, root, [3.25, 1.28, 0.22], [-4.5, 2.75, -3.04], { color: context.theme.metal, surface: 'metal', metalness: 0.8 });
  for (const x of [-5.55, -4.8, -4.05, -3.3]) cylinder(context, root, 0.22, 0.38, [x, 1.58, -2.78], '#d8e3df', 12, 'metal');
  for (const [index, x] of [-4.7, -2.6, -0.5, 1.6, 3.7].entries()) {
    const cloth = box(context, root, [1.62, 1.05 + (index % 2) * 0.1, 0.07], [x, 3.98 - (index % 2) * 0.05, -3.1], {
      color: index % 2 === 0 ? context.theme.accent : '#87372f', castShadow: false, surface: 'wood',
    });
    box(context, root, [1.45, 0.055, 0.08], [x, 3.62, -3.02], { color: '#d29a62', castShadow: false, surface: 'wood' });
    animated.push({ object: cloth, phase: x, speed: 0.8, amplitude: 0.025, axis: 'z' });
  }
  box(context, root, [10.8, 0.24, 0.28], [-0.45, 5.25, -3.08], { color: context.theme.wood, castShadow: false, surface: 'wood' });
  for (const x of [-5.2, -3.1, -1, 1.1, 3.2]) box(context, root, [0.11, 1.0, 0.18], [x, 4.74, -3.06], { color: context.theme.wallDark, castShadow: false, surface: 'wood' });
  addWallShelf(context, root, 3.9, 2.65, -3, 2.1, 2);
  for (const x of [-1.8, -0.7, 0.4, 1.5]) cylinder(context, root, 0.26 + ((x + 2) % 2) * 0.03, 0.42, [x, 1.58, -2.86], '#737a75', 12, 'metal');
  for (const x of [-6.2, -5.7, -5.2]) cylinder(context, root, 0.18, 0.4, [x, 1.55, -2.8], x === -5.7 ? '#d35e4d' : '#efe1bc', 12, 'tile');
  addPixelLantern(context, root, 5.9, 0.52, 2.65, context.theme.glow, 0.95);
}

function arcadeCabinet(
  context: BuildContext,
  root: Group,
  x: number,
  z: number,
  rotation: number,
  color: ColorRepresentation,
  variant: number,
): void {
  const cabinet = new Group();
  cabinet.name = 'focus-occluder:machine';
  cabinet.position.set(x, 0, z);
  cabinet.rotation.y = rotation;
  root.add(cabinet);
  const bodyWidth = variant % 3 === 0 ? 1.08 : variant % 3 === 1 ? 1.18 : 1.12;
  const bodyHeight = variant % 2 === 0 ? 2.7 : 2.84;
  box(context, cabinet, [bodyWidth, bodyHeight, 0.88], [0, bodyHeight / 2, 0], { color: variant % 2 === 0 ? context.theme.wood : '#282d3c', metalness: 0.12, surface: 'metal' });
  box(context, cabinet, [bodyWidth + 0.12, 0.68 + (variant % 2) * 0.08, 1.02], [0, bodyHeight - 0.34, 0.02], { color: context.theme.ink, surface: 'metal' });
  glowPanel(context, cabinet, [0.76 + (variant % 3) * 0.04, 0.5 + (variant % 2) * 0.06, 0.05], [0, bodyHeight - 0.36, 0.54], color);
  box(context, cabinet, [0.96, 0.18, 0.58], [0, 1.67, 0.46], { color: context.theme.metal, metalness: 0.38, surface: 'metal' });
  box(context, cabinet, [0.82, 0.045, 0.05], [0, bodyHeight + 0.04, 0.48], { color, emissive: color, emissiveIntensity: 0.32, castShadow: false, surface: 'emissive' });
  cylinder(context, cabinet, 0.08, 0.2, [-0.25, 1.66, 0.68], '#f1d477', 8, 'emissive');
  cylinder(context, cabinet, 0.06, 0.14, [0.2, 1.67, 0.68], color, 8, 'emissive');
  markFocusOccluder(context, cabinet, 'machine');
}

function buildArcade(context: BuildContext, root: Group, animated: AnimatedProp[]): void {
  // The rear wall is composed like a real late-night arcade: a framed entry,
  // one calm datum and an illuminated threshold. Keeping this as a compact
  // silhouette also protects the draw-call budget.
  box(context, root, [13.3, 0.16, 0.2], [0, 5.92, -3.17], { color: context.theme.woodLight, castShadow: false, surface: 'metal' });
  box(context, root, [3.35, 0.18, 0.24], [0, 5.32, -3.08], { color: '#4a657d', castShadow: false, surface: 'metal' });
  for (const x of [-1.58, 1.58]) {
    box(context, root, [0.17, 3.5, 0.22], [x, 3.55, -3.08], { color: '#405a70', castShadow: false, surface: 'metal' });
  }
  box(context, root, [2.86, 0.055, 0.1], [0, 5.08, -2.92], {
    color: context.theme.neon, emissive: context.theme.neon, emissiveIntensity: 0.2, castShadow: false, surface: 'emissive',
  });
  const cabinetColliders = VENUE_LAYOUTS.arcade.colliders.filter((collider) => collider.id.includes('cabinet'));
  for (const [index, collider] of cabinetColliders.entries()) {
    const point = worldToDiorama({ x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 });
    const left = collider.id.includes('left');
    const screenColor = index % 4 === 3 ? '#d49a55' : index % 2 ? context.theme.accent : context.theme.neon;
    arcadeCabinet(context, root, point.x, point.z, left ? Math.PI / 2 : -Math.PI / 2, screenColor, index);
  }
  const counter = new Group();
  counter.name = 'focus-occluder:counter';
  root.add(counter);
  box(context, counter, [2.45, 1.1, 0.9], [3.12, 0.55, -2.9], { color: context.theme.wood });
  box(context, counter, [2.65, 0.16, 1.08], [3.12, 1.18, -2.9], { color: context.theme.metal, metalness: 0.42 });
  for (const x of [2.55, 3.12, 3.69]) box(context, counter, [0.22, 0.18, 0.04], [x, 1.4, -2.43], {
    color: x === 3.12 ? context.theme.accent : context.theme.neon, emissive: x === 3.12 ? context.theme.accent : context.theme.neon,
    emissiveIntensity: 0.28, castShadow: false, surface: 'emissive',
  });
  markFocusOccluder(context, counter, 'counter');
  const lounge = new Group();
  lounge.name = 'focus-occluder:chair:arcade-lounge';
  root.add(lounge);
  const loungeSeat = box(context, lounge, [3.1, 0.34, 0.72], [0, 0.26, 2.18], { color: '#4a6379', roughness: 0.9, surface: 'plaster' });
  loungeSeat.name = 'seat-surface:arcade-lounge';
  const loungeBackrest = box(context, lounge, [3.1, 0.62, 0.18], [0, 0.56, 1.88], { color: '#354e64', roughness: 0.9, surface: 'plaster' });
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
  box(context, root, [5.2, 0.035, 3.45], [0, 0.12, 1.15], { color: '#4d2736', roughness: 0.95, castShadow: false, surface: 'plaster' });
  box(context, root, [4.82, 0.02, 3.08], [0, 0.145, 1.15], { color: '#263444', roughness: 0.94, castShadow: false, surface: 'plaster' });
  for (const offset of [-2.52, 2.52]) box(context, root, [0.16, 0.045, 3.48], [offset, 0.16, 1.15], { color: '#6e354b', castShadow: false, surface: 'plaster' });
  for (const z of [-0.56, 2.86]) box(context, root, [5.2, 0.045, 0.16], [0, 0.16, z], { color: '#6e354b', castShadow: false, surface: 'plaster' });
  box(context, root, [2.05, 0.16, 0.42], [0, 4.34, -3.08], { color: context.theme.metal, surface: 'metal' });
  glowPanel(context, root, [1.72, 0.08, 0.08], [0, 4.34, -2.82], context.theme.neon);
  addPixelLantern(context, root, -5.65, 4.42, -3.0, '#d5a45e', 0.72);
  addPixelLantern(context, root, 5.65, 4.42, -3.0, '#d5a45e', 0.72);
  const ticketLight = glowPanel(context, root, [0.28, 0.16, 0.04], [3.14, 1.5, -2.44], '#d29b55');
  animated.push({ object: ticketLight, phase: 1, speed: 1.1, amplitude: 0.012, axis: 'y' });
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
  const lightPoolTexture = createPixelLightPoolTexture();
  const context: BuildContext = {
    geometries, materials, theme, profile, surfaces, usedSurfaceKinds, surfaceMaterials, geometryCache, materialCache,
    focusOccluders, seatBindings, lightPoolTexture, focusOccluderSerial: 0,
  };
  const animatedProps: AnimatedProp[] = [];
  const shell = buildShell(context, root, venue);

  if (venue === 'cafe') buildCafe(context, root, animatedProps);
  else if (venue === 'ramen') buildRamen(context, root, animatedProps);
  else buildArcade(context, root, animatedProps);

  const pendants = venue === 'arcade'
    ? [addPendant(context, root, -5.1, -0.5, profile.lights.practical), addPendant(context, root, 5.1, -0.5, profile.lights.practical)]
    : venue === 'ramen'
      ? [
        addPendant(context, root, -4.35, 0.2, profile.lights.practical),
        addPendant(context, root, 4.2, -0.2, profile.lights.practical),
      ]
      : [addPendant(context, root, -4.55, 0.2, theme.glow), addPendant(context, root, 0.1, 0.6, theme.glow), addPendant(context, root, 5.05, -1.15, theme.glow)];

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
      lightPoolTexture.dispose();
      surfaces.dispose();
      root.removeFromParent();
    },
  };
}
