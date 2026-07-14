import type { Point } from './types';
import { SCENE_PROPORTIONS, validateSceneProportions } from '../scene/proportions';

export const WORLD_WIDTH = SCENE_PROPORTIONS.world.width;
export const WORLD_HEIGHT = SCENE_PROPORTIONS.world.height;

export interface Place extends Point { id: string }

export interface CollisionRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Große Möbel werden auch von der Simulation genutzt. Die Sitzplätze liegen
// bewusst direkt an den Kanten, damit Gäste an Stühlen und Bänken ankommen können.
export const CAFE_COLLIDERS: readonly CollisionRect[] = [
  // Der obere Bereich ist eine feste Wandzone; nur der untere, kompakte Rahmen ist die Eingangstür.
  { id: 'left-wall', x: 3, y: 36, width: 43, height: 64 },
  { id: 'door', x: SCENE_PROPORTIONS.door.x, y: SCENE_PROPORTIONS.door.y, width: SCENE_PROPORTIONS.door.width, height: SCENE_PROPORTIONS.door.height },
  { id: 'window-bench', x: 58, y: SCENE_PROPORTIONS.world.floorHorizonY, width: 109, height: 8 },
  { id: 'window-table-left', x: SCENE_PROPORTIONS.dining.frontTableCenters[0] - 18, y: SCENE_PROPORTIONS.dining.frontSurfaceY - 12, width: 37, height: 10 },
  { id: 'window-table-right', x: SCENE_PROPORTIONS.dining.frontTableCenters[1] - 18, y: SCENE_PROPORTIONS.dining.frontSurfaceY - 12, width: 37, height: 10 },
  { id: 'counter', x: SCENE_PROPORTIONS.counter.x, y: SCENE_PROPORTIONS.counter.surfaceY, width: SCENE_PROPORTIONS.counter.width, height: SCENE_PROPORTIONS.counter.baseY - SCENE_PROPORTIONS.counter.surfaceY },
  { id: 'display-case', x: 282, y: 101, width: 32, height: 27 },
  { id: 'plant-stand', x: 254, y: 87, width: 12, height: 45 },
];

export const GUEST_RADIUS = SCENE_PROPORTIONS.character.collisionRadius;

export function pointHitsCafeCollider(point: Point, radius = GUEST_RADIUS): boolean {
  return CAFE_COLLIDERS.some((collider) => (
    point.x + radius > collider.x
    && point.x - radius < collider.x + collider.width
    && point.y + radius > collider.y
    && point.y - radius < collider.y + collider.height
  ));
}

export const ENTRANCE: Point = { x: SCENE_PROPORTIONS.door.entranceX, y: SCENE_PROPORTIONS.door.entranceY };
export const OUTSIDE: Point = { x: -12, y: SCENE_PROPORTIONS.door.entranceY };

export const QUEUE_PLACES: readonly Place[] = [
  { id: 'queue-0', x: 270, y: 173 },
  { id: 'queue-1', x: 246, y: 177 },
  { id: 'queue-2', x: 222, y: 181 },
  { id: 'queue-3', x: 207, y: 195 },
];

export const WAIT_PLACES: readonly Place[] = [
  { id: 'wait-0', x: 266, y: 194 },
  { id: 'wait-1', x: 240, y: 198 },
];

export const SEATS: readonly Place[] = [
  { id: 'seat-window-a', x: 82, y: SCENE_PROPORTIONS.dining.rearSeatY },
  { id: 'seat-window-b', x: 143, y: SCENE_PROPORTIONS.dining.rearSeatY },
  { id: 'seat-table-a1', x: SCENE_PROPORTIONS.dining.frontTableCenters[0] - SCENE_PROPORTIONS.dining.seatPairSpacing / 2 + 1, y: SCENE_PROPORTIONS.dining.frontSeatY },
  { id: 'seat-table-a2', x: SCENE_PROPORTIONS.dining.frontTableCenters[0] + SCENE_PROPORTIONS.dining.seatPairSpacing / 2 + 1, y: SCENE_PROPORTIONS.dining.frontSeatY },
  { id: 'seat-table-b1', x: SCENE_PROPORTIONS.dining.frontTableCenters[1] - SCENE_PROPORTIONS.dining.seatPairSpacing / 2 + 1, y: SCENE_PROPORTIONS.dining.frontSeatY },
  { id: 'seat-table-b2', x: SCENE_PROPORTIONS.dining.frontTableCenters[1] + SCENE_PROPORTIONS.dining.seatPairSpacing / 2 + 1, y: SCENE_PROPORTIONS.dining.frontSeatY },
];

export const BARISTA_PLACES = {
  machine: { x: 316, y: 142 },
  serving: { x: 294, y: 146 },
  wiping: { x: 337, y: 146 },
  restocking: { x: 292, y: 144 },
  polishing: { x: 354, y: 146 },
  grinding: { x: 327, y: 142 },
  tasting: { x: 307, y: 146 },
} as const satisfies Record<string, Point>;

export interface CafeLayoutReport {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly string[];
}

export function validateCafeLayout(): CafeLayoutReport {
  const issues: string[] = validateSceneProportions().issues.map((issue) => issue.code);
  const colliderIds = new Set<string>();
  for (const collider of CAFE_COLLIDERS) {
    if (colliderIds.has(collider.id)) issues.push(`duplicate-collider:${collider.id}`);
    colliderIds.add(collider.id);
    if (collider.width <= 0 || collider.height <= 0) issues.push(`empty-collider:${collider.id}`);
    if (collider.x < 0 || collider.y < 0 || collider.x + collider.width > WORLD_WIDTH || collider.y + collider.height > WORLD_HEIGHT) {
      issues.push(`out-of-bounds:${collider.id}`);
    }
  }

  for (const place of [...SEATS, ...QUEUE_PLACES, ...WAIT_PLACES, { id: 'entrance', ...ENTRANCE }]) {
    if (pointHitsCafeCollider(place, GUEST_RADIUS)) issues.push(`blocked-place:${place.id}`);
  }

  for (let left = 0; left < SEATS.length; left += 1) {
    for (let right = left + 1; right < SEATS.length; right += 1) {
      const a = SEATS[left];
      const b = SEATS[right];
      if (!a || !b) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < GUEST_RADIUS * 2) issues.push(`overlapping-seats:${a.id}:${b.id}`);
    }
  }

  return { valid: issues.length === 0, score: Math.max(0, 100 - issues.length * 8), issues };
}

export const CAFE_LAYOUT_REPORT = validateCafeLayout();
