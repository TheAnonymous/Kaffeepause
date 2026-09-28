import { describe, expect, it } from 'vitest';
import { VENUE_LAYOUTS } from '../src/simulation/layout';
import { worldToDiorama } from '../src/diorama/types';
import { buildVenue, doorLeafDirection, doorShouldBeOpen, doorSpec } from '../src/diorama/venueBuilder';
import { appearanceForGuestNumber } from '../src/simulation/appearance';
import type { Guest } from '../src/simulation/types';
import type { VenueKind } from '../src/venue';

const VENUES: readonly VenueKind[] = ['cafe', 'ramen', 'arcade'];
const SIDE_WALL_INNER_X = 8.12 - 0.125;
const REAR_WALL_FRONT_Z = -3.52 + 0.11;
const LEAF_HALF_THICKNESS = 0.05;

// Freistehende Bodenobjekte neben den Türen, die keine Kollisionsfläche haben.
const FLOOR_PROPS: Readonly<Record<VenueKind, readonly { x: number; z: number; radius: number }[]>> = {
  cafe: [{ x: -6.15, z: 2.7, radius: 0.45 }],
  ramen: [{ x: 5.9, z: 2.65, radius: 0.3 }],
  arcade: [],
};

function leafPoints(venue: VenueKind, open: number): { x: number; z: number }[] {
  const spec = doorSpec(venue);
  const direction = doorLeafDirection(spec, open);
  const normal = { x: -direction.z, z: direction.x };
  const points: { x: number; z: number }[] = [];
  for (let distance = 0.08; distance <= spec.length + 1e-6; distance += 0.05) {
    for (const side of [-1, 1]) {
      points.push({
        x: spec.hinge.x + direction.x * distance + normal.x * LEAF_HALF_THICKNESS * side,
        z: spec.hinge.z + direction.z * distance + normal.z * LEAF_HALF_THICKNESS * side,
      });
    }
  }
  return points;
}

describe('Eingangstür', () => {
  it.each(VENUES)('%s: liegt geschlossen genau in der Wandöffnung', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    const entrance = worldToDiorama(layout.entrance);
    const spec = doorSpec(venue);
    const end = doorLeafDirection(spec, 0);
    const tip = { x: spec.hinge.x + end.x * spec.length, z: spec.hinge.z + end.z * spec.length };
    if (layout.entryFlow === 'rear') {
      expect(Math.abs(spec.hinge.z - REAR_WALL_FRONT_Z)).toBeLessThan(0.1);
      expect(Math.min(spec.hinge.x, tip.x)).toBeGreaterThanOrEqual(entrance.x - 0.82);
      expect(Math.max(spec.hinge.x, tip.x)).toBeLessThanOrEqual(entrance.x + 0.82);
    } else {
      expect(Math.abs(Math.abs(spec.hinge.x) - SIDE_WALL_INNER_X)).toBeLessThan(0.1);
      expect(Math.abs(tip.x - spec.hinge.x)).toBeLessThan(1e-6);
      expect(Math.min(spec.hinge.z, tip.z)).toBeGreaterThanOrEqual(entrance.z - 0.82);
      expect(Math.max(spec.hinge.z, tip.z)).toBeLessThanOrEqual(entrance.z + 0.82);
    }
  });

  it.each(VENUES)('%s: schwingt nach innen und bleibt im Raum', (venue) => {
    for (let open = 0; open <= 1.0001; open += 0.05) {
      for (const point of leafPoints(venue, open)) {
        expect(Math.abs(point.x), `x bei ${open.toFixed(2)}`).toBeLessThanOrEqual(SIDE_WALL_INNER_X + 0.01);
        expect(point.z, `z bei ${open.toFixed(2)}`).toBeGreaterThanOrEqual(REAR_WALL_FRONT_Z - 0.01);
      }
    }
    const spec = doorSpec(venue);
    const open = doorLeafDirection(spec, 1);
    const tip = { x: spec.hinge.x + open.x * spec.length, z: spec.hinge.z + open.z * spec.length };
    expect(Math.hypot(tip.x, tip.z)).toBeLessThan(Math.hypot(spec.hinge.x, spec.hinge.z));
  });

  it.each(VENUES)('%s: streift beim Öffnen weder Möbel noch Stühle noch Pflanzen', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    const colliders = layout.colliders.map((collider) => {
      const min = worldToDiorama({ x: collider.x, y: collider.y });
      const max = worldToDiorama({ x: collider.x + collider.width, y: collider.y + collider.height });
      return { id: collider.id, minX: min.x - 0.03, maxX: max.x + 0.03, minZ: min.z - 0.03, maxZ: max.z + 0.03 };
    });
    const seats = buildVenue(venue).seatBindings.map((binding) => binding.transform.seatCenter);
    for (let open = 0; open <= 1.0001; open += 0.05) {
      for (const point of leafPoints(venue, open)) {
        for (const box of colliders) {
          const inside = point.x > box.minX && point.x < box.maxX && point.z > box.minZ && point.z < box.maxZ;
          expect(inside, `${box.id} bei ${open.toFixed(2)}`).toBe(false);
        }
        for (const seat of seats) {
          const inside = Math.abs(point.x - seat.x) < 0.4 && Math.abs(point.z - seat.z) < 0.4;
          expect(inside, `Sitz bei ${open.toFixed(2)}`).toBe(false);
        }
        for (const prop of FLOOR_PROPS[venue]) {
          expect(Math.hypot(point.x - prop.x, point.z - prop.z), `Bodenobjekt bei ${open.toFixed(2)}`).toBeGreaterThan(prop.radius);
        }
      }
    }
  });

  it.each(VENUES)('%s: lässt den Weg durch die Tür frei, sobald sie offen ist', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    const outside = worldToDiorama(layout.outside);
    const entrance = worldToDiorama(layout.entrance);
    for (const point of leafPoints(venue, 1)) {
      const dx = entrance.x - outside.x;
      const dz = entrance.z - outside.z;
      const t = Math.max(0, Math.min(1, ((point.x - outside.x) * dx + (point.z - outside.z) * dz) / (dx * dx + dz * dz)));
      const distance = Math.hypot(point.x - (outside.x + dx * t), point.z - (outside.z + dz * t));
      expect(distance).toBeGreaterThan(0.45);
    }
  });

  it.each(VENUES)('%s: gibt dem Renderer dieselbe Schwenkbewegung mit', (venue) => {
    const pivot = buildVenue(venue).doorPivot;
    const spec = doorSpec(venue);
    expect(pivot.position.x).toBeCloseTo(spec.hinge.x, 6);
    expect(pivot.position.z).toBeCloseTo(spec.hinge.z, 6);
    expect(pivot.userData).toMatchObject({ closedRotation: spec.closedYaw, openSign: spec.openSign, maxOpen: spec.maxOpen });
  });

  it.each(VENUES)('%s: hat keinen Aktivitätsplatz im Schwenkbereich', (venue) => {
    const spots = VENUE_LAYOUTS[venue].activitySpots.map((spot) => worldToDiorama(spot));
    for (let open = 0; open <= 1.0001; open += 0.05) {
      for (const point of leafPoints(venue, open)) {
        for (const spot of spots) expect(Math.hypot(point.x - spot.x, point.z - spot.z)).toBeGreaterThan(0.4);
      }
    }
  });

  it('bleibt offen, solange ein Gast gerade durch die Tür gekommen ist', () => {
    const guest = (overrides: Partial<Guest>): Guest => ({
      id: 'guest-1', name: 'Test', state: 'queueing', activity: 'reading',
      position: { x: 20, y: 184 }, target: { x: 260, y: 174 }, facing: 1, speed: 20,
      stateTime: 0, stateDuration: 0, animation: 0, activityRounds: 0,
      palette: { skin: '#f0c6a0', hair: '#34252a', coat: '#5f766f', accent: '#e5bb72', trousers: '#343b46', shoes: '#171820' },
      appearance: appearanceForGuestNumber(1),
      ...overrides,
    });
    expect(doorShouldBeOpen([guest({ state: 'entering', position: { x: 0, y: 184 } })], 'cafe')).toBe(true);
    expect(doorShouldBeOpen([guest({})], 'cafe')).toBe(true);
    expect(doorShouldBeOpen([guest({ position: { x: 120, y: 184 } })], 'cafe')).toBe(false);
    expect(doorShouldBeOpen([guest({ state: 'activity', position: { x: 91, y: 180 } })], 'cafe')).toBe(false);
    expect(doorShouldBeOpen([guest({ position: { x: 368, y: 190 } })], 'ramen')).toBe(true);
    expect(doorShouldBeOpen([guest({ position: { x: 192, y: 140 } })], 'arcade')).toBe(true);
  });
});
