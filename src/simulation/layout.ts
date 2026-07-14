import type { Point } from './types';

export const WORLD_WIDTH = 384;
export const WORLD_HEIGHT = 216;

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
  { id: 'door', x: 3, y: 100, width: 43, height: 82 },
  { id: 'window-bench', x: 58, y: 134, width: 109, height: 8 },
  { id: 'window-table-left', x: 87, y: 166, width: 37, height: 10 },
  { id: 'window-table-right', x: 161, y: 166, width: 37, height: 10 },
  { id: 'counter', x: 276, y: 128, width: 108, height: 85 },
  { id: 'display-case', x: 282, y: 101, width: 32, height: 27 },
  { id: 'plant-stand', x: 254, y: 87, width: 12, height: 45 },
];

export const GUEST_RADIUS = 4.25;

export function pointHitsCafeCollider(point: Point, radius = GUEST_RADIUS): boolean {
  return CAFE_COLLIDERS.some((collider) => (
    point.x + radius > collider.x
    && point.x - radius < collider.x + collider.width
    && point.y + radius > collider.y
    && point.y - radius < collider.y + collider.height
  ));
}

export const ENTRANCE: Point = { x: 24, y: 188 };
export const OUTSIDE: Point = { x: -12, y: 188 };

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
  { id: 'seat-window-a', x: 82, y: 147 },
  { id: 'seat-window-b', x: 143, y: 147 },
  { id: 'seat-table-a1', x: 91, y: 187 },
  { id: 'seat-table-a2', x: 121, y: 187 },
  { id: 'seat-table-b1', x: 165, y: 187 },
  { id: 'seat-table-b2', x: 195, y: 187 },
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
