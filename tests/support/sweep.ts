import { Box3, Vector3, type Object3D } from 'three';
import { CafeSimulation } from '../../src/simulation/cafeSimulation';
import { activitySpotById, VENUE_LAYOUTS } from '../../src/simulation/layout';
import { appearanceForGuestNumber } from '../../src/simulation/appearance';
import { approachYawFor, calculateBaristaVisualState, calculateGuestVisualState, seatYawFor } from '../../src/diorama/characterVisualState';
import { participantMidpoint } from '../../src/diorama/cameraFocus';
import { advanceMotion, followPoint, newMotionState, type MotionState } from '../../src/diorama/figureMotion';
import { VoxelFigure } from '../../src/diorama/voxelFigure';
import { buildVenue } from '../../src/diorama/venueBuilder';
import { BARISTA_APPEARANCE, BARISTA_PALETTES, SEAT_TOP_HEIGHT } from '../../src/diorama/characters';
import { DIORAMA, worldToCharacterDiorama } from '../../src/diorama/types';
import type { VenueKind } from '../../src/venue';

// Spielt eine Simulation so durch wie die Darstellung (gleiche Sitzplätze, gleiche Drehung,
// gleiches Einrasten auf dem Stuhl) und meldet für jedes Bild, wo wer steht. Auf diesen
// Messwerten bauen die Prüfungen auf, ohne dass ein Browser nötig ist.

export interface SweepFigure {
  readonly id: string;
  readonly barista: boolean;
  readonly state: string;
  readonly x: number;
  readonly z: number;
  readonly seated: boolean;
  /** Drehung der Figur um die Hochachse, so wie sie gezeichnet wird. */
  readonly yaw: number;
  /** Drehung, die der Sitzplatz verlangt; nur für sitzende Gäste. */
  readonly seatYaw?: number;
  readonly spotId?: string;
  /** Gerade aufgestanden und noch am Stuhl; steht dort noch halb im Möbel. */
  readonly leaving?: boolean;
  /** Drehung, in der ein Aufgestandener noch bleibt. */
  readonly leaveYaw?: number;
}

export interface SweepFrame {
  readonly time: number;
  readonly figures: readonly SweepFigure[];
}

export interface SweepOptions {
  readonly venue: VenueKind;
  readonly seed?: number;
  /** Szenenzeit in Sekunden. */
  readonly seconds: number;
  readonly timeStep?: number;
  /** Verkürzt Tätigkeiten, damit mehr Hinsetzen und Aufstehen vorkommen. */
  readonly durationScale?: number;
  /** Wahrscheinlichkeit pro Bild, dass eine Maus-Reaktion einen Gast zu einer zufälligen Seite wendet. */
  readonly reactionChance?: number;
}

export interface Furniture {
  readonly id: string;
  readonly kind: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface SweepVenue {
  readonly furniture: readonly Furniture[];
  readonly seatCenters: ReadonlyMap<string, { readonly x: number; readonly z: number }>;
}

/** Möbel samt Grundfläche, wie sie die Darstellung baut. */
export function venueFurniture(venue: VenueKind): SweepVenue {
  const set = buildVenue(venue);
  set.root.updateMatrixWorld(true);
  const furniture: Furniture[] = set.focusOccluders.map((occluder) => {
    const box = new Box3().setFromObject(occluder.object as Object3D);
    const size = box.getSize(new Vector3());
    return { id: occluder.id, kind: occluder.kind, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, height: size.y };
  });
  const seatCenters = new Map(set.seatBindings.map((binding) => [binding.activitySpotId, binding.transform.seatCenter]));
  set.dispose();
  return { furniture, seatCenters };
}

export function runSweep(options: SweepOptions, onFrame: (frame: SweepFrame) => void): void {
  const { venue, seconds } = options;
  const dt = options.timeStep ?? 0.05;
  const layout = VENUE_LAYOUTS[venue];
  const { seatCenters } = venueFurniture(venue);
  const simulation = new CafeSimulation({ venue, seed: options.seed ?? 5, durationScale: options.durationScale ?? 0.08 });
  simulation.start();
  let random = (options.seed ?? 5) * 2654435761 % 4294967296;
  const next = (): number => {
    random = (random * 1664525 + 1013904223) % 4294967296;
    return random / 4294967296;
  };

  interface Node { figure: VoxelFigure; motion: MotionState }
  const nodes = new Map<string, Node>();
  const barista: Node = {
    figure: new VoxelFigure({ palette: BARISTA_PALETTES[venue], appearance: BARISTA_APPEARANCE, venue, barista: true, seed: 7 }),
    motion: newMotionState(),
  };

  let time = 0;
  for (let frame = 0; frame < seconds / dt; frame += 1) {
    simulation.update(dt);
    time += dt;
    const snapshot = simulation.getSceneSnapshot();
    const figures: SweepFigure[] = [];
    const reacting = simulation.guests.length > 0 && next() < (options.reactionChance ?? 0)
      ? simulation.guests[Math.floor(next() * simulation.guests.length)]
      : undefined;
    const reaction = reacting
      ? { characterId: reacting.id, gesture: 'wave' as const, facing: next() < 0.5 ? -1 as const : 1 as const }
      : undefined;
    for (const guest of snapshot.guests) {
      const spot = activitySpotById(layout, guest.activitySpotId);
      const participantPositions = snapshot.moment?.participantIds
        .map((id) => snapshot.guests.find((entry) => entry.id === id)?.position)
        .filter((value): value is typeof guest.position => value !== undefined) ?? [];
      const visual = calculateGuestVisualState({
        guest, moment: snapshot.moment, accident: snapshot.accident, reaction, time, frameRate: 6,
        participantCenterX: participantMidpoint(participantPositions)?.x,
        activityPose: spot?.pose, activitySpotKind: spot?.kind, activityFacing: spot?.facing,
        seatOrientation: spot?.pose === 'seated' ? spot.seatOrientation : undefined,
      });
      let node = nodes.get(guest.id);
      if (!node) {
        node = {
          figure: new VoxelFigure({ palette: guest.palette, appearance: appearanceForGuestNumber(3), venue, accessory: guest.accessory, seed: 1 }),
          motion: newMotionState(),
        };
        nodes.set(guest.id, node);
      }
      const seat = visual.seated ? seatCenters.get(guest.activitySpotId ?? '') : undefined;
      const point = seat ?? worldToCharacterDiorama(guest.position);
      const { holdYaw } = advanceMotion(node.motion, {
        seated: visual.seated, point, offsetX: visual.offsetX, deltaSeconds: dt,
        seat: seat && spot?.pose === 'seated' ? { x: seat.x, z: seat.z, yaw: seatYawFor(spot.seatOrientation) } : undefined,
      });
      const target = guest.waypoints?.[0] ?? guest.target;
      node.figure.update({
        visual, seatView: visual.seatView, spotKind: visual.activitySpotKind,
        heading: { x: (target.x - guest.position.x) / 384 * DIORAMA.width, z: (target.y - guest.position.y) / 86 * DIORAMA.depth },
        yawOverride: approachYawFor(guest, spot) ?? holdYaw,
        seatHeight: SEAT_TOP_HEIGHT[visual.activitySpotKind ?? 'table'], time,
      });
      figures.push({
        id: guest.id, barista: false, state: guest.state, x: node.motion.x, z: node.motion.z, seated: visual.seated,
        yaw: node.figure.root.rotation.y,
        seatYaw: visual.seated && spot?.pose === 'seated' ? seatYawFor(spot.seatOrientation) : undefined,
        spotId: guest.activitySpotId,
        leaving: holdYaw !== undefined,
        leaveYaw: holdYaw,
      });
    }
    for (const id of nodes.keys()) {
      if (!snapshot.guests.some((guest) => guest.id === id)) nodes.delete(id);
    }
    const baristaVisual = calculateBaristaVisualState({ barista: snapshot.barista, moment: snapshot.moment, accident: snapshot.accident, time, frameRate: 6 });
    const point = worldToCharacterDiorama(snapshot.barista.position);
    const follow = followPoint(barista.motion, { x: point.x + baristaVisual.offsetX, z: point.z }, dt);
    const catchingUp = follow.lag > 0.02;
    barista.figure.update({
      visual: catchingUp && baristaVisual.pose !== 'walking' ? { ...baristaVisual, pose: 'walking' } : baristaVisual,
      heading: catchingUp ? follow.heading : { x: (snapshot.barista.target.x - snapshot.barista.position.x) / 384 * DIORAMA.width, z: 0 },
      seatHeight: 0, time,
    });
    figures.push({
      id: 'barista', barista: true, state: catchingUp ? 'walking' : snapshot.barista.task, x: barista.motion.x, z: barista.motion.z,
      seated: false, yaw: barista.figure.root.rotation.y,
    });
    onFrame({ time, figures });
  }
}
