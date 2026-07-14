import type { Point } from './types';

export const WORLD_WIDTH = 384;
export const WORLD_HEIGHT = 216;

export interface Place extends Point { id: string }

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
