import { beforeAll, describe, expect, it } from 'vitest';
import { runSweep, venueFurniture, type SweepFigure } from './support/sweep';
import type { VenueKind } from '../src/venue';

// Langer Durchlauf pro Ort: Die Simulation läuft wie in der Darstellung, mit Geschichten, Missgeschicken
// und einer Maus, die Gäste immer wieder zu einer zufälligen Seite wendet. Jedes Bild wird vermessen,
// ob Figuren in Möbeln oder ineinander stehen, springen oder sich in Lehnen drehen.

const VENUES: readonly VenueKind[] = ['cafe', 'ramen', 'arcade'];
/** Halber Körperumfang einer Figur in Diorama-Einheiten. */
const BODY_RADIUS = 0.3;
/** Kopfmaße für die Prüfung an den Automaten: halbe Tiefe, halbe Höhe samt Haaren, Vorneigung beim Spielen. */
const HEAD_HALF_DEPTH = 0.31;
const HEAD_HALF_HEIGHT = 0.43;
const HEAD_TILT_REACH = 0.14;
const angleBetween = (a: number, b: number): number => {
  const difference = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
};

interface Metrics {
  walkerFrames: number;
  /** Bilder, in denen ein Gehender tiefer als 0,15 in einem Möbel steht. */
  inFurnitureFrames: number;
  /** Bilder, in denen ein Gehender näher als 0,45 an einem Sitzenden vorbeigeht. */
  nearSeatedFrames: number;
  /** Bilder, in denen zwei Gehende näher als 0,35 beieinander stehen. */
  overlapFrames: number;
  baristaMaxStep: number;
  baristaCatchUpFrames: number;
  seatYawWorst: number;
  leaveYawWorst: number;
  seatedFrames: number;
  leavingFrames: number;
  /** Längste Zeit, die ein Gast am Stück wartet oder unterwegs ist, in Sekunden. */
  longestWait: number;
  /** Bilder, in denen sich ein Gast bewegt, und davon die, in denen er dabei nicht geht, sondern gleitet. */
  movingFrames: number;
  glidingFrames: number;
  /** Arcade: Bilder, in denen ein Spieler mit dem Kopf ins Bildschirmgehäuse ragt. */
  headInCabinetFrames: number;
  playerFrames: number;
  /** Café: Bilder, in denen Mochi am Boden einem stehenden oder gehenden Gast im Weg ist. */
  catBlockedFrames: number;
  catFrames: number;
}

function measure(venue: VenueKind): Metrics {
  const { furniture, seatCenters, screens } = venueFurniture(venue);
  const metrics: Metrics = {
    walkerFrames: 0, inFurnitureFrames: 0, nearSeatedFrames: 0, overlapFrames: 0,
    baristaMaxStep: 0, baristaCatchUpFrames: 0, seatYawWorst: 0, leaveYawWorst: 0, seatedFrames: 0, leavingFrames: 0, longestWait: 0, movingFrames: 0, glidingFrames: 0, headInCabinetFrames: 0, playerFrames: 0, catBlockedFrames: 0, catFrames: 0,
  };
  const seatedSince = new Map<string, number>();
  const waitingSince = new Map<string, { state: string; time: number }>();
  const lastSeen = new Map<string, SweepFigure>();
  let baristaBefore: SweepFigure | undefined;
  runSweep({ venue, seed: 5, seconds: 900, durationScale: 0.08, reactionChance: 0.05 }, ({ time, figures, cat }) => {
    if (cat) {
      metrics.catFrames += 1;
      if (cat.y < 0.3 && figures.some((figure) => !figure.barista && !figure.seated && !figure.passingThrough
        && Math.hypot(figure.x - cat.x, figure.z - cat.z) < 0.5)) metrics.catBlockedFrames += 1;
    }
    for (const figure of figures) {
      if (figure.head && figure.state === 'activity' && figure.spotId?.startsWith(`${venue}-`) && screens.length > 0
        && (figure.spotId.includes('-left-') || figure.spotId.includes('-right-'))) {
        metrics.playerFrames += 1;
        const screen = screens.reduce((best, entry) => (
          Math.hypot(entry.x - figure.head!.x, entry.z - figure.head!.z) < Math.hypot(best.x - figure.head!.x, best.z - figure.head!.z) ? entry : best
        ));
        // Kopf mit Haaren, leicht nach vorn geneigt (wer aufs Spiel schaut, senkt den Kopf).
        const gap = Math.abs(figure.head.x - screen.x) - HEAD_HALF_DEPTH - HEAD_TILT_REACH;
        const reachesHousing = figure.head.y + HEAD_HALF_HEIGHT > screen.y - screen.halfHeight - 0.12;
        if (gap < 0 && reachesHousing && Math.abs(figure.head.z - screen.z) < 0.7) metrics.headInCabinetFrames += 1;
      }
      const before = lastSeen.get(figure.id);
      lastSeen.set(figure.id, figure);
      if (!figure.barista && before && !before.seated && !figure.seated && !figure.settling
        && Math.hypot(figure.x - figure.offsetX - (before.x - before.offsetX), figure.z - before.z) > 0.01) {
        metrics.movingFrames += 1;
        if (!figure.stepping) metrics.glidingFrames += 1;
      }
      if (figure.barista) {
        if (baristaBefore) metrics.baristaMaxStep = Math.max(metrics.baristaMaxStep, Math.hypot(figure.x - baristaBefore.x, figure.z - baristaBefore.z));
        if (figure.state === 'walking') metrics.baristaCatchUpFrames += 1;
        baristaBefore = figure;
        continue;
      }
      if (figure.seated && figure.seatYaw !== undefined) {
        const since = seatedSince.get(figure.id) ?? time;
        seatedSince.set(figure.id, since);
        if (time - since > 0.8) {
          metrics.seatedFrames += 1;
          metrics.seatYawWorst = Math.max(metrics.seatYawWorst, angleBetween(figure.yaw, figure.seatYaw));
        }
        continue;
      }
      seatedSince.delete(figure.id);
      const waiting = figure.state !== 'activity' && figure.state !== 'entering' && figure.state !== 'exiting';
      const since = waitingSince.get(figure.id);
      if (!waiting || !since || since.state !== figure.state) waitingSince.set(figure.id, { state: figure.state, time });
      else metrics.longestWait = Math.max(metrics.longestWait, time - since.time);
      if (figure.state === 'entering' || figure.state === 'exiting') continue;
      if (figure.leaving) {
        metrics.leavingFrames += 1;
        if (figure.leaveYaw !== undefined) metrics.leaveYawWorst = Math.max(metrics.leaveYawWorst, angleBetween(figure.yaw, figure.leaveYaw));
        continue;
      }
      metrics.walkerFrames += 1;
      const own = figure.spotId ? seatCenters.get(figure.spotId) : undefined;
      for (const item of furniture) {
        if (item.height < 0.3) continue;
        // Das eigene Möbel darf man betreten; Arcade-Spieler stehen an ihrem Automaten.
        if (own && own.x >= item.minX && own.x <= item.maxX && own.z >= item.minZ && own.z <= item.maxZ) continue;
        if (item.kind === 'machine' && figure.state === 'activity') continue;
        const dx = Math.max(item.minX - figure.x, 0, figure.x - item.maxX);
        const dz = Math.max(item.minZ - figure.z, 0, figure.z - item.maxZ);
        if (BODY_RADIUS - Math.hypot(dx, dz) > 0.15) {
          metrics.inFurnitureFrames += 1;
          break;
        }
      }
    }
    const guests = figures.filter((figure) => !figure.barista && !figure.passingThrough && figure.state !== 'entering' && figure.state !== 'exiting');
    for (let left = 0; left < guests.length; left += 1) {
      for (let right = left + 1; right < guests.length; right += 1) {
        const a = guests[left]!;
        const b = guests[right]!;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        if (a.seated !== b.seated) {
          if (distance < 0.45) metrics.nearSeatedFrames += 1;
        } else if (!a.seated && distance < 0.35) {
          metrics.overlapFrames += 1;
        }
      }
    }
  });
  return metrics;
}

describe.each(VENUES)('Langer Durchlauf: %s', (venue) => {
  let metrics: Metrics;
  beforeAll(() => { metrics = measure(venue); }, 120_000);

  it('hat genug Bewegung, damit die Prüfungen etwas sagen', () => {
    expect(metrics.walkerFrames).toBeGreaterThan(20_000);
    expect(metrics.seatedFrames).toBeGreaterThan(3_000);
  });

  it('lässt Gehende nicht durch Stühle, Tische und Theken laufen', () => {
    expect(metrics.inFurnitureFrames / metrics.walkerFrames).toBeLessThan(0.02);
  });

  it('lässt Gehende nicht durch Sitzende oder ineinander laufen', () => {
    expect(metrics.nearSeatedFrames).toBeLessThanOrEqual(20);
    expect(metrics.overlapFrames / metrics.walkerFrames).toBeLessThan(0.001);
  });

  it('lässt Sitzende immer zum Stuhl blicken, egal wohin Maus oder Geschichte sie wenden', () => {
    expect(metrics.seatYawWorst).toBeLessThan(0.1);
  });

  it('dreht Aufgestandene nicht in der Lehne um', () => {
    expect(metrics.leavingFrames).toBeGreaterThan(0);
    expect(metrics.leaveYawWorst).toBeLessThan(0.35);
  });

  it('lässt Gäste gehen, wenn sie sich bewegen, statt durch den Raum zu gleiten', () => {
    expect(metrics.movingFrames).toBeGreaterThan(10_000);
    expect(metrics.glidingFrames / metrics.movingFrames).toBeLessThan(0.005);
  });

  it('lässt Spieler nicht mit dem Kopf in die Automaten ragen', () => {
    if (venue !== 'arcade') return;
    expect(metrics.playerFrames).toBeGreaterThan(5_000);
    expect(metrics.headInCabinetFrames).toBe(0);
  });

  it('lässt Mochi kaum jemandem im Weg stehen', () => {
    if (venue !== 'cafe') return;
    expect(metrics.catFrames).toBeGreaterThan(10_000);
    expect(metrics.catBlockedFrames / metrics.catFrames).toBeLessThan(0.008);
  });

  it('lässt keinen Gast minutenlang festhängen', () => {
    expect(metrics.longestWait).toBeLessThan(120);
  });

  it('lässt die Bedienung nie springen', () => {
    expect(metrics.baristaMaxStep).toBeLessThan(0.2);
  });
});

describe('Bedienung an der Theke', () => {
  it('läuft bei Szenen zum neuen Platz, statt dort zu erscheinen', () => {
    expect(measure('cafe').baristaCatchUpFrames).toBeGreaterThan(0);
  }, 120_000);
});
