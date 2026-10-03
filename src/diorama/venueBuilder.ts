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
import type { Guest } from '../simulation/types';
import {
  VENUE_LAYOUTS,
  type SeatedActivitySpot,
  type SeatOrientation,
  type VenueLayout,
} from '../simulation/layout';
import {
  DIORAMA,
  DIORAMA_THEMES,
  FLOOR_SURFACE_Y,
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
import { ARCADE_GAMES, ArcadeScreen } from './arcadeScreens';
import { batchStaticVenuePrimitives } from './venueBatching';
import type { Season } from './season';

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
  readonly screens: ArcadeScreen[];
  /** Café-Scheibe mit Tropfenmuster; die Darstellung blendet sie bei Regen ein. */
  rainGlass?: MeshBasicMaterial;
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

/**
 * Baut einen Tisch exakt auf die Tischfläche der Simulation. So sitzen Gäste an
 * den Tischenden statt in der Platte, und niemand läuft durch eine Tischkante.
 */
function tableFootprint(venue: VenueKind, colliderId: string): { x: number; z: number; width: number; depth: number } {
  const collider = VENUE_LAYOUTS[venue].colliders.find((entry) => entry.id === colliderId);
  if (!collider) throw new Error(`Tischfläche fehlt: ${colliderId}`);
  const { x, z } = worldToDiorama({ x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 });
  return {
    x,
    z,
    width: collider.width / 384 * DIORAMA.width,
    depth: Math.max(0.74, collider.height / 86 * DIORAMA.depth),
  };
}

function addTable(context: BuildContext, root: Group, venue: VenueKind, colliderId: string): void {
  const { x, z, width, depth } = tableFootprint(venue, colliderId);
  const table = new Group();
  table.name = 'focus-occluder:table';
  root.add(table);
  box(context, table, [width, 0.15, depth], [x, 0.84, z], { color: context.theme.woodLight, roughness: 0.72, surface: 'wood' });
  box(context, table, [width - 0.12, 0.08, depth - 0.18], [x, 0.94, z], { color: context.theme.wood, roughness: 0.65, surface: 'wood' });
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

/** Brett unter den Regalen mit Pflanze, Bücherstapel und Tasse, früher ein gemaltes Bild. */
function addCafeStillLife(context: BuildContext, root: Group): void {
  box(context, root, [1.3, 0.1, 0.36], [-6.3, 1.62, -3.02], { color: context.theme.woodLight, roughness: 0.78, surface: 'wood' });
  cylinder(context, root, 0.12, 0.2, [-6.72, 1.77, -3.0], '#b0603a', 8);
  const greens = ['#426c55', '#56805c', '#789168'];
  for (let index = 0; index < 5; index += 1) {
    const leaf = box(context, root, [0.08, 0.3 - (index % 2) * 0.06, 0.06], [-6.72 + (index - 2) * 0.06, 2.0 + (index % 3) * 0.04, -3.0 + ((index % 2) - 0.5) * 0.08], {
      color: greens[index % greens.length], castShadow: false,
    });
    leaf.rotation.z = (index - 2) * 0.22;
  }
  for (const [index, color] of ['#3d5b4a', '#7a3b2e', '#c9a46a'].entries()) {
    const book = box(context, root, [0.36 - index * 0.03, 0.08, 0.25], [-6.2, 1.71 + index * 0.085, -3.02], { color, roughness: 0.8, surface: 'wood' });
    book.rotation.y = (index - 1) * 0.14;
  }
  addMug(context, root, -5.86, 1.77, -2.98, '#4f6b52');
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
  // Der Himmel bekommt kein Oberflächenmuster: Das Glasmuster zeichnet Tropfen, die sonst bei jedem Wetter am Himmel hingen.
  city.material = new MeshStandardMaterial({ color: '#668aa4' });
  context.materials.add(city.material);
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

const SIDE_WALL_INNER_X = 8.12 - 0.125;
const REAR_WALL_FRONT_Z = -3.52 + 0.11;
const DOOR_HALF_OPENING = 0.82;
const DOOR_HEIGHT = 3.75;

/** Wie die Tür in ihrer Wandöffnung hängt und wie weit sie nach innen aufschwingt. */
export interface DoorSpec {
  readonly hinge: DioramaPoint;
  /** Drehung (rotation.y), bei der das Türblatt geschlossen in der Öffnung liegt. */
  readonly closedYaw: number;
  readonly openSign: 1 | -1;
  readonly maxOpen: number;
  readonly length: number;
}

export function doorSpec(venue: VenueKind): DoorSpec {
  const layout = VENUE_LAYOUTS[venue];
  const entrance = worldToDiorama(layout.entrance);
  const length = DOOR_HALF_OPENING * 2 - 0.06;
  if (layout.entryFlow === 'rear') {
    return {
      hinge: { x: entrance.x - DOOR_HALF_OPENING + 0.03, z: REAR_WALL_FRONT_Z + 0.06 },
      closedYaw: 0, openSign: -1, maxOpen: Math.PI / 2, length,
    };
  }
  const side = layout.entryFlow === 'left' ? -1 : 1;
  // Im Ramen-Restaurant sitzt das Scharnier vorn: hinten stünde der Stuhl am Zweiertisch im Weg.
  const hingeAtFront = venue === 'ramen';
  return {
    hinge: {
      x: side * (SIDE_WALL_INNER_X - 0.06),
      z: entrance.z + (hingeAtFront ? DOOR_HALF_OPENING - 0.03 : -DOOR_HALF_OPENING + 0.03),
    },
    closedYaw: hingeAtFront ? Math.PI / 2 : -Math.PI / 2,
    openSign: (side < 0) === !hingeAtFront ? 1 : -1,
    maxOpen: Math.PI / 2,
    length,
  };
}

/** Richtung des Türblatts in der Ebene, 0 = geschlossen, 1 = ganz offen. */
export function doorLeafDirection(spec: DoorSpec, open: number): DioramaPoint {
  const yaw = spec.closedYaw + spec.openSign * Math.min(1, Math.max(0, open)) * spec.maxOpen;
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Türblattlänge plus halbe Körperbreite. */
const DOOR_SWEEP_CLEARANCE = 1.95;

/**
 * Die Tür öffnet für ein- und ausgehende Gäste am Eingang und bleibt offen,
 * solange sich jemand in ihrem Schwenkbereich bewegt, damit sie niemanden durchschlägt.
 */
export function doorShouldBeOpen(guests: readonly Guest[], venue: VenueKind): boolean {
  const entrance = VENUE_LAYOUTS[venue].entrance;
  const hinge = doorSpec(venue).hinge;
  return guests.some((guest) => {
    if ((guest.state === 'entering' || guest.state === 'exiting' || guest.state === 'walking-to-exit')
      && Math.hypot(guest.position.x - entrance.x, guest.position.y - entrance.y) < 48) return true;
    if (guest.state === 'activity') return false;
    const point = worldToDiorama(guest.position);
    return Math.hypot(point.x - hinge.x, point.z - hinge.z) < DOOR_SWEEP_CLEARANCE;
  });
}

function addDoor(context: BuildContext, root: Group, venue: VenueKind): Group {
  const layout = VENUE_LAYOUTS[venue];
  const spec = doorSpec(venue);
  const doorPivot = new Group();
  doorPivot.position.set(spec.hinge.x, 0.1, spec.hinge.z);
  doorPivot.rotation.y = spec.closedYaw;
  doorPivot.userData.closedRotation = spec.closedYaw;
  doorPivot.userData.openSign = spec.openSign;
  doorPivot.userData.maxOpen = spec.maxOpen;
  doorPivot.userData.staticBatchBoundary = true;
  root.add(doorPivot);
  const { length } = spec;
  box(context, doorPivot, [length, DOOR_HEIGHT, 0.1], [length / 2, DOOR_HEIGHT / 2, 0], { color: context.theme.wood, roughness: 0.65, surface: 'wood' });
  for (const face of [-1, 1]) {
    box(context, doorPivot, [length * 0.72, 2.4, 0.03], [length / 2, 2.28, face * 0.065], { color: context.theme.wallDark, roughness: 0.3, surface: 'glass' });
  }
  glowPanel(context, doorPivot, [0.1, 0.1, 0.16], [length - 0.16, 1.83, 0], context.theme.glow);

  // Zarge auf der Innenseite der Wand: zwei Pfosten und ein Sturz um die Öffnung.
  const entrance = worldToDiorama(layout.entrance);
  const frame = { color: context.theme.woodLight };
  if (layout.entryFlow === 'rear') {
    for (const x of [-DOOR_HALF_OPENING, DOOR_HALF_OPENING]) box(context, root, [0.12, 4.2, 0.12], [entrance.x + x, 2.18, REAR_WALL_FRONT_Z + 0.04], frame);
    box(context, root, [DOOR_HALF_OPENING * 2 + 0.24, 0.16, 0.12], [entrance.x, 4.26, REAR_WALL_FRONT_Z + 0.04], frame);
  } else {
    const x = (layout.entryFlow === 'left' ? -1 : 1) * (SIDE_WALL_INNER_X - 0.02);
    for (const z of [-DOOR_HALF_OPENING, DOOR_HALF_OPENING]) box(context, root, [0.12, 4.2, 0.12], [x, 2.18, entrance.z + z], frame);
    box(context, root, [0.12, 0.16, DOOR_HALF_OPENING * 2 + 0.24], [x, 4.26, entrance.z], frame);
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
  const halfOpening = DOOR_HALF_OPENING;
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
  // Unbeleuchtet wie die anderen Fenster: Beleuchtet würden die Lampen im Raum die Scheibe nachts aufhellen.
  // Das Tropfenmuster zeigt die Darstellung nur bei Regen (`rainGlass`).
  const glassMaterial = new MeshBasicMaterial({
    color: '#9fb8c2', transparent: true, opacity: 0.02, depthWrite: false, side: DoubleSide,
    map: context.surfaces.get('glass'),
  });
  context.usedSurfaceKinds.add('glass');
  context.materials.add(glassMaterial);
  context.rainGlass = glassMaterial;
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

/** Fensteröffnung in der Rückwand (Diorama-Koordinaten). */
export interface WindowOpening {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Wo man in jedem Ort nach draußen schaut; der Regen fällt nur hinter diesen Fenstern. */
export const VENUE_WINDOWS: Readonly<Record<VenueKind, WindowOpening>> = {
  cafe: { minX: -5.9, maxX: 5.0, minY: 1.5, maxY: 7.3 },
  ramen: { minX: 5.6, maxX: 7.6, minY: 1.7, maxY: 4.3 },
  arcade: { minX: -5.2, maxX: -2.2, minY: 2.2, maxY: 4.2 },
};

const BACK_WALL_Z = -3.52;

/**
 * Unbeleuchtete, fast durchsichtige Scheibe. Beleuchtet würde sie nachts von den
 * Lampen im Raum so hell, dass sie den Blick nach draußen grau verschleiert.
 */
function addGlassPane(context: BuildContext, root: Group, opening: WindowOpening, z: number): void {
  const geometry = sharedGeometry(context, 'plane:unit', () => new PlaneGeometry(1, 1));
  const glassMaterial = new MeshBasicMaterial({
    color: '#d6e8ee', transparent: true, opacity: 0.02, depthWrite: false, side: DoubleSide,
  });
  context.materials.add(glassMaterial);
  const glass = new Mesh(geometry, glassMaterial);
  glass.position.set((opening.minX + opening.maxX) / 2, (opening.minY + opening.maxY) / 2, z);
  glass.scale.set(opening.maxX - opening.minX, opening.maxY - opening.minY, 1);
  glass.userData.staticPrimitiveKind = 'plane';
  glass.userData.staticBatchable = false;
  root.add(glass);
}

/** Rückwand von `fromX` bis `toX` mit einer Fensteröffnung. */
function addWallWithWindow(
  context: BuildContext,
  root: Group,
  fromX: number,
  toX: number,
  opening: WindowOpening,
  options: BoxOptions,
): void {
  const height = 8.5;
  const piece = (minX: number, maxX: number, minY: number, maxY: number): void => {
    if (maxX - minX <= 0.001 || maxY - minY <= 0.001) return;
    box(context, root, [maxX - minX, maxY - minY, 0.22], [(minX + maxX) / 2, (minY + maxY) / 2, BACK_WALL_Z], options);
  };
  piece(fromX, opening.minX, 0, height);
  piece(opening.maxX, toX, 0, height);
  piece(opening.minX, opening.maxX, 0, opening.minY);
  piece(opening.minX, opening.maxX, opening.maxY, height);
}

function addRamenWindow(context: BuildContext, root: Group): void {
  const opening = VENUE_WINDOWS.ramen;
  addWallWithWindow(context, root, -DIORAMA.width / 2, DIORAMA.width / 2, opening, { color: context.theme.wall, surface: 'tile' });
  addGlassPane(context, root, opening, -3.47);
  const width = opening.maxX - opening.minX;
  const height = opening.maxY - opening.minY;
  const centerX = (opening.minX + opening.maxX) / 2;
  const centerY = (opening.minY + opening.maxY) / 2;
  const frame = { color: context.theme.wood };
  box(context, root, [width + 0.28, 0.14, 0.2], [centerX, opening.maxY + 0.07, -3.36], frame);
  box(context, root, [width + 0.36, 0.16, 0.34], [centerX, opening.minY - 0.08, -3.3], { color: context.theme.woodLight });
  for (const x of [opening.minX - 0.07, opening.maxX + 0.07]) box(context, root, [0.14, height + 0.28, 0.2], [x, centerY, -3.36], frame);
  // Holzgitter (Kōshi): schmale senkrechte Latten vor der Scheibe.
  for (let x = opening.minX + 0.25; x < opening.maxX - 0.1; x += 0.25) {
    box(context, root, [0.045, height, 0.05], [x, centerY, -3.42], { color: context.theme.woodLight, castShadow: false });
  }
  box(context, root, [width, 0.045, 0.05], [centerX, centerY + 0.35, -3.42], { color: context.theme.woodLight, castShadow: false });
}

function addArcadeBackWall(context: BuildContext, root: Group): void {
  const opening = VENUE_WINDOWS.arcade;
  addWallWithWindow(context, root, -DIORAMA.width / 2, -0.8, opening, { color: context.theme.wall, surface: 'plaster' });
  box(context, root, [7.2, 8.5, 0.22], [4.4, 4.25, BACK_WALL_Z], { color: context.theme.wall, surface: 'plaster' });
  box(context, root, [1.6, 4.55, 0.22], [0, 6.52, BACK_WALL_Z], { color: context.theme.wallDark, surface: 'plaster' });
  addGlassPane(context, root, opening, -3.47);
  const width = opening.maxX - opening.minX;
  const height = opening.maxY - opening.minY;
  const centerX = (opening.minX + opening.maxX) / 2;
  const centerY = (opening.minY + opening.maxY) / 2;
  const frame = { color: context.theme.wallDark, metalness: 0.4, roughness: 0.4 };
  for (const y of [opening.minY - 0.06, opening.maxY + 0.06]) box(context, root, [width + 0.24, 0.12, 0.18], [centerX, y, -3.36], frame);
  for (const x of [opening.minX - 0.06, opening.maxX + 0.06]) box(context, root, [0.12, height + 0.24, 0.18], [x, centerY, -3.36], frame);
  box(context, root, [0.08, height, 0.1], [centerX, centerY, -3.42], frame);
  // Neonrahmen, der nachts in die Nacht hinaus leuchtet.
  glowPanel(context, root, [width + 0.2, 0.04, 0.04], [centerX, opening.maxY + 0.14, -3.26], context.theme.glow);
  glowPanel(context, root, [width + 0.2, 0.04, 0.04], [centerX, opening.minY - 0.14, -3.26], context.theme.accent);
}

/** Gegenüberliegende Straßenseite, die man durch eine offene Seitentür sieht. */
function addStreetBeyondDoor(context: BuildContext, root: Group, venue: VenueKind, exteriorMaterials: MeshStandardMaterial[]): void {
  const layout = VENUE_LAYOUTS[venue];
  if (layout.entryFlow === 'rear') return;
  const side = layout.entryFlow === 'left' ? -1 : 1;
  const doorZ = worldToDiorama(layout.entrance).z;
  box(context, root, [2.4, 0.1, 3.4], [side * 9.45, 0.02, doorZ], { color: '#2b2a30', roughness: 0.8, surface: 'floor', castShadow: false });
  const facade = box(context, root, [0.12, 6, 3.4], [side * 10.6, 3, doorZ], { color: '#354157', castShadow: false, surface: 'plaster' });
  exteriorMaterials.push(facade.material);
  for (const [dz, y] of [[-0.8, 2.2], [0.7, 2.2], [-0.8, 4.1], [0.7, 4.1]] as const) {
    glowPanel(context, root, [0.04, 0.5, 0.42], [side * 10.52, y, doorZ + dz], '#e6bd75');
  }
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
  const exteriorMaterials = [...addExterior(context, root)];
  addSideWall(context, root, venue, 'left');
  addSideWall(context, root, venue, 'right');
  if (venue === 'cafe') addCafeWindow(context, root);
  else if (venue === 'arcade') addArcadeBackWall(context, root);
  else addRamenWindow(context, root);
  addStreetBeyondDoor(context, root, venue, exteriorMaterials);
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
  addTable(context, root, 'cafe', 'cafe-table-a');
  addTable(context, root, 'cafe', 'cafe-table-b');
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
  addCafeStillLife(context, root);
  addWallShelf(context, root, 4.82, 3.12, -3.02, 2.75, 2);
  const tableA = tableFootprint('cafe', 'cafe-table-a');
  const tableB = tableFootprint('cafe', 'cafe-table-b');
  addPixelLantern(context, root, tableB.x, 1.28, tableB.z, context.theme.glow, 0.78);
  addMug(context, root, tableA.x + 0.26, 1.14, tableA.z, '#c6a77c');
  addMug(context, root, tableA.x - 0.24, 1.14, tableA.z, '#807862');
  addMug(context, root, tableB.x - 0.6, 1.14, tableB.z - 0.04, '#688078');
  addMug(context, root, tableB.x + 0.47, 1.14, tableB.z - 0.04, '#a57452');
  addPlant(context, root, 2.1, 0.05, -2.85);
  addPlant(context, root, -6.15, 0.05, 2.7);
  const cup = cylinder(context, root, 0.13, 0.24, [tableA.x, 1.15, tableA.z - 0.02], '#ece0bd', 12);
  animated.push({ object: cup, phase: 0.2, speed: 1.1, amplitude: 0.025, axis: 'y' });
  addSteamPlume(context, root, animated, tableA.x, 1.36, tableA.z - 0.02, 0.2);
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
  addTable(context, root, 'ramen', 'ramen-pair-table');
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
  // Das Bildschirmgehäuse steht kaum über den Korpus vor; sonst stößt der Kopf des Spielers hinein.
  box(context, cabinet, [bodyWidth + 0.12, 0.68 + (variant % 2) * 0.08, 0.94], [0, bodyHeight - 0.34, -0.02], { color: context.theme.ink, surface: 'metal' });
  // Auf jedem Automaten läuft ein eigenes kleines Pixelspiel.
  const screen = new ArcadeScreen(ARCADE_GAMES[variant % ARCADE_GAMES.length]!, color, 0.76 + (variant % 3) * 0.04, 0.5 + (variant % 2) * 0.06);
  screen.mesh.position.set(0, bodyHeight - 0.36, 0.475);
  registerSelectiveBloomSurface(screen.mesh);
  cabinet.add(screen.mesh);
  context.screens.push(screen);
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
    // Der Bildschirm weiß, vor welchem Spielplatz er steht (`arcade-left-cabinet-1` → `arcade-left-1`).
    const screen = context.screens[context.screens.length - 1];
    if (screen) screen.spotId = collider.id.replace('-cabinet', '');
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
  // Das Sofa behält Sitzhöhe (Oberkante 0,43) und Standfläche; Kissen und Armlehnen machen es erkennbar.
  const loungeSeat = box(context, lounge, [3.1, 0.2, 0.72], [0, 0.18, 2.18], { color: '#4a6379', roughness: 0.9, surface: 'plaster' });
  loungeSeat.name = 'seat-surface:arcade-lounge';
  for (const x of [-1.04, 0, 1.04]) {
    box(context, lounge, [0.98, 0.15, 0.68], [x, 0.355, 2.2], { color: '#6a8aa6', roughness: 0.92, surface: 'plaster' });
    box(context, lounge, [0.96, 0.42, 0.16], [x, 0.66, 2.0], { color: '#6a8aa6', roughness: 0.92, surface: 'plaster' });
  }
  const loungeBackrest = box(context, lounge, [3.1, 0.62, 0.18], [0, 0.56, 1.88], { color: '#354e64', roughness: 0.9, surface: 'plaster' });
  loungeBackrest.name = 'seat-backrest:arcade-lounge';
  for (const side of [-1, 1]) {
    box(context, lounge, [0.2, 0.62, 0.74], [side * 1.65, 0.39, 2.18], { color: '#354e64', roughness: 0.9, surface: 'plaster' });
  }
  const pillow = box(context, lounge, [0.46, 0.4, 0.13], [-1.0, 0.7, 2.1], { color: '#d2628f', roughness: 0.85, surface: 'plaster' });
  pillow.rotation.z = -0.18;
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

function addPumpkin(context: BuildContext, root: Group, x: number, y: number, z: number, size = 1): void {
  box(context, root, [0.44 * size, 0.3 * size, 0.38 * size], [x, y + 0.15 * size, z], { color: '#c9622a', roughness: 0.72 });
  box(context, root, [0.3 * size, 0.34 * size, 0.42 * size], [x, y + 0.17 * size, z], { color: '#e0813a', roughness: 0.72 });
  box(context, root, [0.07 * size, 0.1 * size, 0.07 * size], [x, y + 0.37 * size, z], { color: '#4f6b35' });
  // Geschnitztes Gesicht, das abends leuchtet.
  const front = z + 0.21 * size;
  glowPanel(context, root, [0.07 * size, 0.06 * size, 0.02], [x - 0.08 * size, y + 0.21 * size, front], '#ffc45c');
  glowPanel(context, root, [0.07 * size, 0.06 * size, 0.02], [x + 0.08 * size, y + 0.21 * size, front], '#ffc45c');
  glowPanel(context, root, [0.2 * size, 0.04 * size, 0.02], [x, y + 0.1 * size, front], '#ffb347');
}

function addStringLights(context: BuildContext, root: Group, fromX: number, toX: number, y: number, z: number): void {
  const colors = ['#ffd27a', '#ff6b6b', '#7ee07a', '#6fb7ff'];
  const count = Math.max(2, Math.round((toX - fromX) / 0.34) + 1);
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const sag = Math.sin(progress * Math.PI * Math.max(1, Math.round((toX - fromX) / 1.6))) * 0.05;
    glowPanel(context, root, [0.07, 0.09, 0.07], [fromX + (toX - fromX) * progress, y - Math.abs(sag), z], colors[index % colors.length]!);
  }
}

function addSeasonalDecor(context: BuildContext, root: Group, venue: VenueKind, season: Season): void {
  if (season === 'halloween') {
    if (venue === 'cafe') {
      addPumpkin(context, root, 3.65, 1.36, -1.75, 0.8);
      addPumpkin(context, root, 7.35, 1.36, -1.85, 0.95);
      addPumpkin(context, root, -6.15, FLOOR_SURFACE_Y, -1.85, 1.05);
      addPumpkin(context, root, -5.7, FLOOR_SURFACE_Y, -2.25, 0.75);
    } else if (venue === 'ramen') {
      addPumpkin(context, root, 3.7, 1.33, -1.9, 0.85);
      addPumpkin(context, root, -6.4, FLOOR_SURFACE_Y, -1.1, 1.0);
    } else {
      addPumpkin(context, root, -1.35, 0.87, 1.88, 0.7);
      addPumpkin(context, root, 1.35, 0.87, 1.88, 0.8);
    }
  } else if (season === 'winter-lights') {
    if (venue === 'cafe') {
      addStringLights(context, root, 3.4, 7.7, 1.2, -1.34);
      addStringLights(context, root, -5.4, -0.95, 1.52, -1.92);
    } else if (venue === 'ramen') {
      addStringLights(context, root, -6.0, 3.9, 1.15, -1.4);
    } else {
      addStringLights(context, root, -1.5, 1.5, 0.92, 1.88);
      addStringLights(context, root, -6.4, 6.4, 5.82, -3.02);
    }
  }
}

/** Wo die Thekenklingel steht (Oberkante der Theke). */
export const COUNTER_BELLS: Readonly<Record<VenueKind, Readonly<{ x: number; y: number; z: number }>>> = {
  cafe: { x: 4.55, y: 1.36, z: -1.6 },
  ramen: { x: 3.1, y: 1.33, z: -1.62 },
  arcade: { x: 4.15, y: 1.26, z: -2.62 },
};

function addCounterBell(context: BuildContext, root: Group, venue: VenueKind): { bell: Group; dome: Group } {
  const spot = COUNTER_BELLS[venue];
  const bell = new Group();
  bell.name = 'counter-bell';
  bell.position.set(spot.x, spot.y, spot.z);
  root.add(bell);
  box(context, bell, [0.26, 0.035, 0.26], [0, 0.0175, 0], { color: '#3a2f2a', roughness: 0.6 });
  const dome = new Group();
  dome.name = 'counter-bell:dome';
  bell.add(dome);
  const brass = { color: '#d9b25a', metalness: 0.7, roughness: 0.3, surface: 'metal' as const };
  box(context, dome, [0.2, 0.08, 0.2], [0, 0.075, 0], brass);
  box(context, dome, [0.13, 0.05, 0.13], [0, 0.14, 0], brass);
  box(context, dome, [0.04, 0.045, 0.04], [0, 0.185, 0], { color: '#8a6a3a', metalness: 0.5, roughness: 0.4, surface: 'metal' });
  return { bell, dome };
}

export function buildVenue(venue: VenueKind, season: Season = 'none'): DioramaSet {
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
    focusOccluders, seatBindings, lightPoolTexture, screens: [], focusOccluderSerial: 0,
  };
  const animatedProps: AnimatedProp[] = [];
  const shell = buildShell(context, root, venue);

  if (venue === 'cafe') buildCafe(context, root, animatedProps);
  else if (venue === 'ramen') buildRamen(context, root, animatedProps);
  else buildArcade(context, root, animatedProps);
  addSeasonalDecor(context, root, venue, season);
  const counterBell = addCounterBell(context, root, venue);

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
    counterBell.bell,
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
    bell: counterBell.bell,
    bellDome: counterBell.dome,
    practicalLights: pendants.map((pendant) => pendant.light),
    floorMaterial: shell.floorMaterial,
    exteriorMaterials: shell.exteriorMaterials,
    lightPools: pendants.map((pendant) => pendant.pool),
    animatedProps,
    screens: context.screens,
    rainGlass: context.rainGlass,
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
      for (const screen of context.screens) screen.dispose();
      surfaces.dispose();
      root.removeFromParent();
    },
  };
}
