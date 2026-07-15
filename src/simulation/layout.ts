import type { VenueKind } from '../venue';
import type { BaristaTask, GuestActivity, Point } from './types';

export const WORLD_WIDTH = 384;
export const WORLD_HEIGHT = 216;
export const GUEST_RADIUS = 5;

export interface Place extends Point {
  readonly id: string;
}

export interface CollisionRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ActivitySpotKind = 'bench' | 'table' | 'counter-stool' | 'arcade-cabinet' | 'lounge';
export type ActivityPose = 'seated' | 'standing';
export type ActivitySpotTag = 'window' | 'table-pair' | 'counter-adjacent' | 'cabinet-pair' | 'lounge';
export type SeatOrientation = 'left' | 'right' | 'front' | 'radial';
export type EntryFlow = 'left' | 'right' | 'rear';

interface ActivitySpotBase extends Place {
  readonly kind: ActivitySpotKind;
  readonly facing: -1 | 1;
  readonly groupId: string;
  readonly tags: readonly ActivitySpotTag[];
  readonly activities: readonly GuestActivity[];
  readonly focusHeight: number;
}

export interface SeatedActivitySpot extends ActivitySpotBase {
  readonly pose: 'seated';
  readonly seatOrientation: SeatOrientation;
}

export interface StandingActivitySpot extends ActivitySpotBase {
  readonly pose: 'standing';
  readonly seatOrientation?: never;
}

export type ActivitySpot = SeatedActivitySpot | StandingActivitySpot;

export interface NavigationBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly step: number;
}

export interface PopulationBounds {
  readonly min: number;
  readonly max: number;
}

export interface VenueLayout {
  readonly venue: VenueKind;
  readonly entryFlow: EntryFlow;
  readonly entrance: Readonly<Point>;
  readonly outside: Readonly<Point>;
  readonly colliders: readonly CollisionRect[];
  readonly queuePlaces: readonly Place[];
  readonly waitPlaces: readonly Place[];
  readonly activitySpots: readonly ActivitySpot[];
  readonly staffPlaces: Readonly<Record<BaristaTask, Readonly<Point>>>;
  readonly population: PopulationBounds;
  readonly navigation: NavigationBounds;
}

const QUIET_ACTIVITIES = [
  'reading', 'typing', 'talking', 'drinking', 'phone', 'sketching', 'journaling', 'knitting', 'board-game',
] as const satisfies readonly GuestActivity[];
const RAMEN_COUNTER_ACTIVITIES = ['drinking', 'talking', 'phone', 'journaling'] as const satisfies readonly GuestActivity[];
const ARCADE_MACHINE_ACTIVITIES = ['typing', 'board-game', 'phone', 'talking'] as const satisfies readonly GuestActivity[];

const cafe: VenueLayout = {
  venue: 'cafe',
  entryFlow: 'left',
  entrance: { x: 20, y: 184 },
  outside: { x: -16, y: 184 },
  colliders: [
    { id: 'cafe-window-bench', x: 60, y: 145, width: 110, height: 8 },
    { id: 'cafe-table-a', x: 102, y: 172, width: 38, height: 10 },
    { id: 'cafe-table-b', x: 176, y: 181, width: 44, height: 10 },
    { id: 'cafe-counter', x: 274, y: 139, width: 105, height: 18 },
    { id: 'cafe-cake-case', x: 244, y: 140, width: 24, height: 25 },
    { id: 'cafe-plant-stand', x: 236, y: 132, width: 8, height: 24 },
  ],
  queuePlaces: [
    { id: 'cafe-queue-0', x: 260, y: 174 },
    { id: 'cafe-queue-1', x: 238, y: 174 },
    { id: 'cafe-queue-2', x: 222, y: 166 },
    { id: 'cafe-queue-3', x: 202, y: 160 },
  ],
  waitPlaces: [
    { id: 'cafe-wait-0', x: 266, y: 196 },
    { id: 'cafe-wait-1', x: 240, y: 202 },
  ],
  activitySpots: [
    { id: 'cafe-window-a', x: 86, y: 160, kind: 'bench', pose: 'seated', seatOrientation: 'front', facing: 1, groupId: 'cafe-window', tags: ['window'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'cafe-window-b', x: 145, y: 160, kind: 'bench', pose: 'seated', seatOrientation: 'front', facing: -1, groupId: 'cafe-window', tags: ['window'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'cafe-table-a1', x: 91, y: 180, kind: 'table', pose: 'seated', seatOrientation: 'right', facing: 1, groupId: 'cafe-table-a', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'cafe-table-a2', x: 151, y: 180, kind: 'table', pose: 'seated', seatOrientation: 'left', facing: -1, groupId: 'cafe-table-a', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'cafe-table-b1', x: 165, y: 198, kind: 'table', pose: 'seated', seatOrientation: 'right', facing: 1, groupId: 'cafe-table-b', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'cafe-table-b2', x: 231, y: 198, kind: 'table', pose: 'seated', seatOrientation: 'left', facing: -1, groupId: 'cafe-table-b', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
  ],
  staffPlaces: {
    machine: { x: 329, y: 132 }, serving: { x: 294, y: 132 }, wiping: { x: 350, y: 132 },
    restocking: { x: 282, y: 132 }, polishing: { x: 365, y: 132 }, grinding: { x: 338, y: 132 }, tasting: { x: 310, y: 132 },
  },
  population: { min: 4, max: 6 },
  navigation: { minX: 14, maxX: 368, minY: 132, maxY: 204, step: 12 },
};

const ramen: VenueLayout = {
  venue: 'ramen',
  entryFlow: 'right',
  entrance: { x: 368, y: 190 },
  outside: { x: 400, y: 190 },
  colliders: [
    { id: 'ramen-open-counter', x: 45, y: 145, width: 245, height: 12 },
    { id: 'ramen-pair-table', x: 304, y: 174, width: 28, height: 12 },
    { id: 'ramen-ceramic-shelf', x: 16, y: 132, width: 22, height: 40 },
  ],
  queuePlaces: [
    { id: 'ramen-queue-0', x: 300, y: 158 },
    { id: 'ramen-queue-1', x: 320, y: 194 },
    { id: 'ramen-queue-2', x: 342, y: 198 },
    { id: 'ramen-queue-3', x: 360, y: 204 },
  ],
  waitPlaces: [
    { id: 'ramen-wait-0', x: 280, y: 190 },
    { id: 'ramen-wait-1', x: 256, y: 202 },
  ],
  activitySpots: [
    { id: 'ramen-counter-1', x: 74, y: 166, kind: 'counter-stool', pose: 'seated', seatOrientation: 'radial', facing: 1, groupId: 'ramen-counter', tags: ['counter-adjacent'], activities: RAMEN_COUNTER_ACTIVITIES, focusHeight: 1.62 },
    { id: 'ramen-counter-2', x: 118, y: 166, kind: 'counter-stool', pose: 'seated', seatOrientation: 'radial', facing: 1, groupId: 'ramen-counter', tags: ['counter-adjacent'], activities: RAMEN_COUNTER_ACTIVITIES, focusHeight: 1.62 },
    { id: 'ramen-counter-3', x: 162, y: 166, kind: 'counter-stool', pose: 'seated', seatOrientation: 'radial', facing: 1, groupId: 'ramen-counter', tags: ['counter-adjacent'], activities: RAMEN_COUNTER_ACTIVITIES, focusHeight: 1.62 },
    { id: 'ramen-counter-4', x: 206, y: 166, kind: 'counter-stool', pose: 'seated', seatOrientation: 'radial', facing: -1, groupId: 'ramen-counter', tags: ['counter-adjacent'], activities: RAMEN_COUNTER_ACTIVITIES, focusHeight: 1.62 },
    { id: 'ramen-counter-5', x: 250, y: 166, kind: 'counter-stool', pose: 'seated', seatOrientation: 'radial', facing: -1, groupId: 'ramen-counter', tags: ['counter-adjacent'], activities: RAMEN_COUNTER_ACTIVITIES, focusHeight: 1.62 },
    { id: 'ramen-table-a', x: 293, y: 181, kind: 'table', pose: 'seated', seatOrientation: 'right', facing: 1, groupId: 'ramen-table', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
    { id: 'ramen-table-b', x: 343, y: 181, kind: 'table', pose: 'seated', seatOrientation: 'left', facing: -1, groupId: 'ramen-table', tags: ['table-pair'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
  ],
  staffPlaces: {
    machine: { x: 228, y: 134 }, serving: { x: 188, y: 134 }, wiping: { x: 92, y: 134 },
    restocking: { x: 58, y: 134 }, polishing: { x: 130, y: 134 }, grinding: { x: 250, y: 134 }, tasting: { x: 210, y: 134 },
  },
  population: { min: 5, max: 7 },
  navigation: { minX: 16, maxX: 370, minY: 132, maxY: 204, step: 12 },
};

const arcade: VenueLayout = {
  venue: 'arcade',
  entryFlow: 'rear',
  entrance: { x: 192, y: 136 },
  outside: { x: 192, y: 116 },
  colliders: [
    { id: 'arcade-left-cabinet-1', x: 42, y: 140, width: 22, height: 20 },
    { id: 'arcade-left-cabinet-2', x: 42, y: 166, width: 22, height: 20 },
    { id: 'arcade-left-cabinet-3', x: 42, y: 192, width: 22, height: 20 },
    { id: 'arcade-right-cabinet-1', x: 320, y: 140, width: 22, height: 20 },
    { id: 'arcade-right-cabinet-2', x: 320, y: 166, width: 22, height: 20 },
    { id: 'arcade-right-cabinet-3', x: 320, y: 192, width: 22, height: 20 },
    { id: 'arcade-token-counter', x: 238, y: 130, width: 58, height: 16 },
    { id: 'arcade-lounge-bench', x: 150, y: 193, width: 84, height: 5 },
  ],
  queuePlaces: [
    { id: 'arcade-queue-0', x: 226, y: 150 },
    { id: 'arcade-queue-1', x: 210, y: 158 },
    { id: 'arcade-queue-2', x: 192, y: 170 },
    { id: 'arcade-queue-3', x: 192, y: 188 },
  ],
  waitPlaces: [
    { id: 'arcade-wait-0', x: 246, y: 162 },
    { id: 'arcade-wait-1', x: 270, y: 176 },
  ],
  activitySpots: [
    { id: 'arcade-left-1', x: 76, y: 150, kind: 'arcade-cabinet', pose: 'standing', facing: -1, groupId: 'arcade-pair-1', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-left-2', x: 76, y: 176, kind: 'arcade-cabinet', pose: 'standing', facing: -1, groupId: 'arcade-pair-2', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-left-3', x: 76, y: 202, kind: 'arcade-cabinet', pose: 'standing', facing: -1, groupId: 'arcade-pair-3', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-right-1', x: 308, y: 150, kind: 'arcade-cabinet', pose: 'standing', facing: 1, groupId: 'arcade-pair-1', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-right-2', x: 308, y: 176, kind: 'arcade-cabinet', pose: 'standing', facing: 1, groupId: 'arcade-pair-2', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-right-3', x: 308, y: 202, kind: 'arcade-cabinet', pose: 'standing', facing: 1, groupId: 'arcade-pair-3', tags: ['cabinet-pair'], activities: ARCADE_MACHINE_ACTIVITIES, focusHeight: 2.02 },
    { id: 'arcade-lounge', x: 192, y: 204, kind: 'lounge', pose: 'seated', seatOrientation: 'front', facing: 1, groupId: 'arcade-lounge', tags: ['lounge'], activities: QUIET_ACTIVITIES, focusHeight: 1.58 },
  ],
  staffPlaces: {
    machine: { x: 268, y: 124 }, serving: { x: 246, y: 124 }, wiping: { x: 286, y: 124 },
    restocking: { x: 254, y: 124 }, polishing: { x: 278, y: 124 }, grinding: { x: 262, y: 124 }, tasting: { x: 242, y: 124 },
  },
  population: { min: 4, max: 7 },
  navigation: { minX: 18, maxX: 366, minY: 130, maxY: 204, step: 12 },
};

export const VENUE_LAYOUTS: Readonly<Record<VenueKind, VenueLayout>> = Object.freeze({ cafe, ramen, arcade });

export interface VenueLayoutReport {
  readonly venue: VenueKind;
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly string[];
}

export function pointHitsVenueCollider(layout: VenueLayout, point: Point, radius = GUEST_RADIUS): boolean {
  return layout.colliders.some((collider) => (
    point.x + radius > collider.x
    && point.x - radius < collider.x + collider.width
    && point.y + radius > collider.y
    && point.y - radius < collider.y + collider.height
  ));
}

export function segmentIsClear(layout: VenueLayout, start: Point, end: Point, radius = GUEST_RADIUS): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(start.x - end.x, start.y - end.y) / 2));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    if (pointHitsVenueCollider(layout, {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    }, radius)) return false;
  }
  return true;
}

export function planVenueRoute(layout: VenueLayout, start: Point, target: Point): Point[] {
  if (segmentIsClear(layout, start, target)) return [];
  const { minX, maxX, minY, maxY, step } = layout.navigation;
  const columns = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxY - minY) / step) + 1;
  const pointFor = (column: number, row: number): Point => ({ x: minX + column * step, y: minY + row * step });
  const keyFor = (column: number, row: number): string => `${column}:${row}`;
  const parseKey = (key: string): readonly [number, number] => key.split(':').map(Number) as [number, number];
  const nearestVisibleNode = (origin: Point): string | undefined => {
    const candidates: Array<{ key: string; distance: number }> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const point = pointFor(column, row);
        if (pointHitsVenueCollider(layout, point) || !segmentIsClear(layout, origin, point)) continue;
        candidates.push({ key: keyFor(column, row), distance: Math.hypot(origin.x - point.x, origin.y - point.y) });
      }
    }
    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0]?.key;
  };
  const startKey = nearestVisibleNode(start);
  const endKey = nearestVisibleNode(target);
  if (!startKey || !endKey) return [];
  const queue = [startKey];
  const visited = new Set(queue);
  const previous = new Map<string, string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current === endKey) break;
    const [column, row] = parseKey(current);
    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextColumn = column + offsetX;
      const nextRow = row + offsetY;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const nextKey = keyFor(nextColumn, nextRow);
      const nextPoint = pointFor(nextColumn, nextRow);
      if (visited.has(nextKey) || pointHitsVenueCollider(layout, nextPoint)
        || !segmentIsClear(layout, pointFor(column, row), nextPoint)) continue;
      visited.add(nextKey);
      previous.set(nextKey, current);
      queue.push(nextKey);
    }
  }
  if (!visited.has(endKey)) return [];
  const pathKeys = [endKey];
  while (pathKeys[0] !== startKey) {
    const predecessor = previous.get(pathKeys[0] ?? '');
    if (!predecessor) return [];
    pathKeys.unshift(predecessor);
  }
  return pathKeys.map((key) => {
    const [column, row] = parseKey(key);
    return pointFor(column, row);
  }).filter((point) => Math.hypot(point.x - start.x, point.y - start.y) > 0.2
    && Math.hypot(point.x - target.x, point.y - target.y) > 0.2);
}

export function routeIsClear(layout: VenueLayout, start: Point, target: Point): boolean {
  const route = [...planVenueRoute(layout, start, target), target];
  let previous = start;
  for (const point of route) {
    if (!segmentIsClear(layout, previous, point)) return false;
    previous = point;
  }
  return true;
}

export function activitySpotById(layout: VenueLayout, id?: string): ActivitySpot | undefined {
  return id ? layout.activitySpots.find((spot) => spot.id === id) : undefined;
}

export function validateVenueLayout(layout: VenueLayout): VenueLayoutReport {
  const issues: string[] = [];
  const ids = new Set<string>();
  const resources = [...layout.colliders, ...layout.queuePlaces, ...layout.waitPlaces, ...layout.activitySpots];
  for (const resource of resources) {
    if (ids.has(resource.id)) issues.push(`duplicate-id:${resource.id}`);
    ids.add(resource.id);
  }
  for (const collider of layout.colliders) {
    if (collider.width <= 0 || collider.height <= 0) issues.push(`empty-collider:${collider.id}`);
    if (collider.x < 0 || collider.y < 0 || collider.x + collider.width > WORLD_WIDTH || collider.y + collider.height > WORLD_HEIGHT) {
      issues.push(`out-of-bounds:${collider.id}`);
    }
  }
  const places = [...layout.queuePlaces, ...layout.waitPlaces, ...layout.activitySpots, { id: 'entrance', ...layout.entrance }];
  for (const place of places) {
    if (pointHitsVenueCollider(layout, place)) issues.push(`blocked-place:${place.id}`);
    if (place.x < 0 || place.x > WORLD_WIDTH || place.y < 0 || place.y > WORLD_HEIGHT) issues.push(`out-of-bounds:${place.id}`);
  }
  for (let left = 0; left < layout.activitySpots.length; left += 1) {
    for (let right = left + 1; right < layout.activitySpots.length; right += 1) {
      const a = layout.activitySpots[left];
      const b = layout.activitySpots[right];
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < GUEST_RADIUS * 2) issues.push(`overlapping-spots:${a.id}:${b.id}`);
    }
  }
  for (const [task, point] of Object.entries(layout.staffPlaces)) {
    if (point.x < 0 || point.x > WORLD_WIDTH || point.y < 0 || point.y > WORLD_HEIGHT) issues.push(`staff-out-of-bounds:${task}`);
    if (pointHitsVenueCollider(layout, point, 3)) issues.push(`blocked-staff:${task}`);
  }
  if (layout.activitySpots.length !== layout.population.max) issues.push('capacity-mismatch');
  if (layout.population.min < 0 || layout.population.min > layout.population.max) issues.push('invalid-population');
  if (!routeIsClear(layout, layout.outside, layout.entrance)) issues.push('unreachable-entry');
  for (const place of [...layout.queuePlaces, ...layout.waitPlaces, ...layout.activitySpots]) {
    if (!routeIsClear(layout, layout.entrance, place)) issues.push(`unreachable:${place.id}`);
  }
  return { venue: layout.venue, valid: issues.length === 0, score: Math.max(0, 100 - issues.length * 6), issues };
}

export const VENUE_LAYOUT_REPORTS: Readonly<Record<VenueKind, VenueLayoutReport>> = Object.freeze({
  cafe: validateVenueLayout(cafe),
  ramen: validateVenueLayout(ramen),
  arcade: validateVenueLayout(arcade),
});
