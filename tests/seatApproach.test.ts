import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import { activitySpotById, VENUE_LAYOUTS } from '../src/simulation/layout';
import { appearanceForGuestNumber } from '../src/simulation/appearance';
import { approachYawFor, calculateGuestVisualState, seatYawFor } from '../src/diorama/characterVisualState';
import { VoxelFigure } from '../src/diorama/voxelFigure';
import { DIORAMA, worldToDiorama } from '../src/diorama/types';
import { SEAT_TOP_HEIGHT } from '../src/diorama/characters';
import type { VenueKind } from '../src/venue';

const TIME_STEP = 1 / 30;

function angleBetween(a: number, b: number): number {
  const difference = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

/** Spielt eine Simulation durch und prüft für jeden Gast, wie er beim Hinsetzen steht. */
function sitDowns(venue: VenueKind): { guest: string; spot: string; error: number }[] {
  const layout = VENUE_LAYOUTS[venue];
  const simulation = new CafeSimulation({ venue, seed: 5, durationScale: 0.05, accidents: false, moments: false, stories: false });
  simulation.start();
  const figures = new Map<string, VoxelFigure>();
  const wasSeated = new Map<string, boolean>();
  const results: { guest: string; spot: string; error: number }[] = [];
  let time = 0;
  for (let frame = 0; frame < 30 * 600; frame += 1) {
    simulation.update(TIME_STEP);
    time += TIME_STEP;
    for (const guest of simulation.guests) {
      const spot = activitySpotById(layout, guest.activitySpotId);
      const visual = calculateGuestVisualState({
        guest, time, frameRate: 6,
        activityPose: spot?.pose, activitySpotKind: spot?.kind, activityFacing: spot?.facing,
        seatOrientation: spot?.pose === 'seated' ? spot.seatOrientation : undefined,
      });
      let figure = figures.get(guest.id);
      if (!figure) {
        figure = new VoxelFigure({ palette: guest.palette, appearance: appearanceForGuestNumber(3), venue, seed: 1 });
        figures.set(guest.id, figure);
      }
      const next = guest.waypoints?.[0] ?? guest.target;
      figure.update({
        visual, seatView: visual.seatView, spotKind: visual.activitySpotKind,
        heading: { x: (next.x - guest.position.x) / 384 * DIORAMA.width, z: (next.y - guest.position.y) / 86 * DIORAMA.depth },
        approachYaw: approachYawFor(guest, spot),
        seatHeight: SEAT_TOP_HEIGHT[visual.activitySpotKind ?? 'table'], time,
      });
      if (visual.seated && !wasSeated.get(guest.id) && spot?.pose === 'seated') {
        results.push({ guest: guest.id, spot: spot.id, error: angleBetween(figure.root.rotation.y, seatYawFor(spot.seatOrientation)) });
      }
      wasSeated.set(guest.id, visual.seated);
    }
  }
  return results;
}

describe('Hinsetzen', () => {
  it.each(['cafe', 'ramen'] as const)('%s: Gäste stehen beim Hinsetzen schon zum Stuhl und drehen sich nicht erst auf ihm', (venue) => {
    const results = sitDowns(venue);
    expect(results.length).toBeGreaterThan(5);
    for (const result of results) {
      expect(result.error, `${result.guest} auf ${result.spot}`).toBeLessThan(0.35);
    }
  });

  it('dreht sich nur auf den letzten Schritten und nur beim Weg zu einem Sitzplatz', () => {
    const layout = VENUE_LAYOUTS.cafe;
    const bench = layout.activitySpots.find((spot) => spot.kind === 'bench');
    expect(bench).toBeDefined();
    const base = {
      id: 'guest-1', name: 'Mara', state: 'walking-to-seat' as const, activity: 'reading' as const,
      position: { x: bench!.x, y: bench!.y + 40 }, target: { x: bench!.x, y: bench!.y }, facing: 1 as const,
      speed: 20, stateTime: 0, stateDuration: 20, animation: 0, activityRounds: 0,
      palette: { skin: '#d8a071', hair: '#3a252b', coat: '#557b78', accent: '#e5b568', trousers: '#343b46', shoes: '#171820' },
      appearance: appearanceForGuestNumber(3),
    };
    expect(approachYawFor(base, bench)).toBeUndefined();
    expect(approachYawFor({ ...base, position: { x: bench!.x, y: bench!.y + 4 } }, bench)).toBe(0);
    expect(approachYawFor({ ...base, state: 'walking-to-exit', position: { x: bench!.x, y: bench!.y + 4 } }, bench)).toBeUndefined();
    expect(worldToDiorama(base.target).z).toBeLessThan(0);
  });
});
