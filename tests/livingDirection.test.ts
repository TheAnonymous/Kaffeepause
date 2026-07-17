import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import {
  GUEST_RADIUS,
  VENUE_LAYOUTS,
  activitySpotById,
  pointHitsVenueCollider,
  pointIsOutsideVenue,
  pointWithinVenueWalkableArea,
  routeIsClear,
} from '../src/simulation/layout';
import {
  GOLDEN_LIVING_SEQUENCES,
  LIVING_ROUTES_BY_VENUE,
  livingDirectionRoute,
} from '../src/simulation/livingDirection';
import type { Guest, Point } from '../src/simulation/types';
import type { VenueKind } from '../src/venue';

const VENUES = ['cafe', 'ramen', 'arcade'] as const satisfies readonly VenueKind[];
const moving = (guest: Guest): boolean => guest.state === 'entering'
  || guest.state === 'exiting'
  || guest.state === 'queueing'
  || guest.state === 'waiting'
  || guest.state.includes('walking');
const distance = (left: Point, right: Point): number => Math.hypot(left.x - right.x, left.y - right.y);

describe('handinszenierte Raumbewegung', () => {
  it.each(VENUES)('%s besitzt drei begehbare, venue-spezifische Wege und eine Golden Sequence', (venue) => {
    const layout = VENUE_LAYOUTS[venue];
    const routes = LIVING_ROUTES_BY_VENUE[venue];
    expect(routes).toHaveLength(3);
    const golden = livingDirectionRoute(GOLDEN_LIVING_SEQUENCES[venue]);
    expect(golden).toMatchObject({ venue, signature: true });

    for (const route of routes) {
      expect(route.venue).toBe(venue);
      expect(route.stops.length).toBeGreaterThan(0);
      const authoredPoints = [
        ...route.stops.flatMap((stop) => (stop.via ?? []).map((point, index) => ({
          id: `${stop.id}:via-${index + 1}`,
          point,
        }))),
        ...route.returnVia.map((point, index) => ({ id: `${route.id}:return-via-${index + 1}`, point })),
      ];
      for (const { id, point } of authoredPoints) {
        expect(pointWithinVenueWalkableArea(layout, point), id).toBe(true);
        expect(pointHitsVenueCollider(layout, point, GUEST_RADIUS), id).toBe(false);
        expect(routeIsClear(layout, layout.entrance, point), id).toBe(true);
      }
      for (const stop of route.stops) {
        expect(pointWithinVenueWalkableArea(layout, stop), stop.id).toBe(true);
        expect(pointHitsVenueCollider(layout, stop, GUEST_RADIUS), stop.id).toBe(false);
        expect(routeIsClear(layout, layout.entrance, stop), stop.id).toBe(true);
      }
      const eligibleHomes = layout.activitySpots.filter((spot) => route.eligibleTags.some((tag) => spot.tags.includes(tag)));
      expect(eligibleHomes.length, route.id).toBeGreaterThan(0);
      for (const home of eligibleHomes) {
        expect(routeIsClear(layout, home, route.stops[0]!), `${route.id}:${home.id}:outbound`).toBe(true);
        expect(routeIsClear(layout, route.stops.at(-1)!, home), `${route.id}:${home.id}:return`).toBe(true);
      }
    }
  });

  it.each(VENUES)('%s spielt seine Golden Sequence vollständig und ohne statische Kollision', (venue) => {
    const simulation = new CafeSimulation({
      venue,
      seed: 0x1a11_2026,
      durationScale: 0.04,
      livingSequence: GOLDEN_LIVING_SEQUENCES[venue],
      accidents: false,
      moments: false,
      stories: false,
    });
    simulation.start();
    const seenStates = new Set<string>();
    const seenRoutes = new Set<string>();
    for (let step = 0; step < 20_000 && simulation.stats.livingSequencesCompleted === 0; step += 1) {
      simulation.update(0.1);
      for (const guest of simulation.guests) {
        seenStates.add(guest.state);
        if (guest.movementRouteId) seenRoutes.add(guest.movementRouteId);
        expect(pointHitsVenueCollider(VENUE_LAYOUTS[venue], guest.position, GUEST_RADIUS), guest.id).toBe(false);
        expect(pointWithinVenueWalkableArea(VENUE_LAYOUTS[venue], guest.position), guest.id).toBe(true);
      }
    }
    expect(seenRoutes).toContain(GOLDEN_LIVING_SEQUENCES[venue]);
    expect([...seenStates]).toEqual(expect.arrayContaining(['walking-scene', 'scene-pause', 'walking-back-to-activity']));
    expect(simulation.stats.livingSequencesCompleted).toBeGreaterThan(0);
    expect(simulation.stats.navigationDeadlocks).toBe(0);
  });
});

describe('deterministische Navigations-Langzeitmatrix', () => {
  it('hält alle Figuren über 30 simulierte Minuten pro Venue und Seed frei und beweglich', () => {
    for (const venue of VENUES) {
      for (const seed of [7, 42, 2026]) {
        const simulation = new CafeSimulation({
          venue,
          seed,
          durationScale: 0.18,
          accidents: false,
          moments: false,
          stories: false,
        });
        simulation.start();
        const previous = new Map<string, Point>();
        const stationary = new Map<string, number>();
        let minimumGuestDistance = Number.POSITIVE_INFINITY;
        let maximumStationarySeconds = 0;
        for (let step = 0; step < 18_000; step += 1) {
          simulation.update(0.1);
          for (const guest of simulation.guests) {
            const last = previous.get(guest.id);
            const remaining = distance(guest.position, guest.waypoints?.[0] ?? guest.target);
            const displacement = last ? distance(last, guest.position) : Number.POSITIVE_INFINITY;
            const still = moving(guest) && remaining > 0.5 && displacement < 0.02
              ? (stationary.get(guest.id) ?? 0) + 0.1
              : 0;
            stationary.set(guest.id, still);
            previous.set(guest.id, { ...guest.position });
            maximumStationarySeconds = Math.max(maximumStationarySeconds, still);
            if (still >= 6) throw new Error(JSON.stringify({
              issue: 'stuck', venue, seed, step, still, guest,
              guests: simulation.guests,
              navigation: simulation.getSceneSnapshot().navigation,
              reservations: [...simulation.reservations.snapshot()],
            }));
            if (pointHitsVenueCollider(VENUE_LAYOUTS[venue], guest.position, GUEST_RADIUS)) {
              throw new Error(`collider:${venue}:${seed}:${guest.id}:${guest.position.x},${guest.position.y}`);
            }
            if (!pointWithinVenueWalkableArea(VENUE_LAYOUTS[venue], guest.position)) {
              throw new Error(`bounds:${venue}:${seed}:${guest.id}:${guest.position.x},${guest.position.y}`);
            }
          }

          if (step % 5 === 0) {
            const inside = simulation.guests.filter((guest) => !pointIsOutsideVenue(VENUE_LAYOUTS[venue], guest.position));
            for (let left = 0; left < inside.length; left += 1) {
              for (let right = left + 1; right < inside.length; right += 1) {
                const first = inside[left]!;
                const second = inside[right]!;
                const separation = distance(first.position, second.position);
                minimumGuestDistance = Math.min(minimumGuestDistance, separation);
                if (separation < GUEST_RADIUS * 1.9) {
                  throw new Error(`overlap:${venue}:${seed}:${first.id}:${second.id}:${separation.toFixed(2)}`);
                }
              }
            }
          }
        }
        const snapshot = simulation.getSceneSnapshot();
        expect(snapshot.navigation.staticClear, `${venue}:${seed}`).toBe(true);
        expect(snapshot.navigation.deadlocks, `${venue}:${seed}`).toBe(0);
        expect(snapshot.navigation.maxBlockedSeconds, `${venue}:${seed}`).toBeLessThan(6);
        expect(maximumStationarySeconds, `${venue}:${seed}`).toBeLessThan(6);
        expect(minimumGuestDistance, `${venue}:${seed}`).toBeGreaterThanOrEqual(GUEST_RADIUS * 1.9);
        expect(simulation.stats.livingSequencesCompleted, `${venue}:${seed}`).toBeGreaterThanOrEqual(2);
        expect(pointHitsVenueCollider(VENUE_LAYOUTS[venue], simulation.barista.position, 3), `${venue}:${seed}:staff`).toBe(false);
        for (const guest of simulation.guests) {
          const home = activitySpotById(VENUE_LAYOUTS[venue], guest.activitySpotId);
          if (guest.state === 'activity') expect(home?.id).toBe(guest.activitySpotId);
        }
      }
    }
  }, 30_000);
});
