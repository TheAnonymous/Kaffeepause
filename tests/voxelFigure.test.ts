import { describe, expect, it } from 'vitest';
import { VoxelFigure } from '../src/diorama/voxelFigure';
import { HIP_HEIGHT, SEAT_TOP_HEIGHT } from '../src/diorama/characters';
import { appearanceForGuestNumber } from '../src/simulation/appearance';
import type { CharacterVisualState } from '../src/diorama/characterVisualState';

const palette = { skin: '#f0c6a0', hair: '#34252a', coat: '#5f766f', accent: '#e5bb72', trousers: '#343b46', shoes: '#171820' };

function visual(overrides: Partial<CharacterVisualState>): CharacterVisualState {
  return {
    pose: 'walking', frame: 0, facing: 1, expression: 'neutral', gesture: 'none',
    offsetX: 0, offsetY: 0, seated: false, ...overrides,
  };
}

function figure(): VoxelFigure {
  return new VoxelFigure({ palette, appearance: appearanceForGuestNumber(3), venue: 'cafe', seed: 1 });
}

function bodyY(subject: VoxelFigure): number {
  return subject.root.children[0]!.position.y;
}

describe('Klötzchen-Figuren bewegen sich weich', () => {
  it('dreht sich beim Richtungswechsel, statt umzuspringen', () => {
    const subject = figure();
    subject.update({ visual: visual({}), heading: { x: 1, z: 0 }, seatHeight: 0, time: 0 });
    expect(subject.root.rotation.y).toBeCloseTo(Math.PI / 2, 5);
    subject.update({ visual: visual({}), heading: { x: -1, z: 0 }, seatHeight: 0, time: 0.05 });
    // Nach einem kurzen Moment ist die Figur angedreht, aber noch lange nicht umgedreht.
    const turned = Math.abs(subject.root.rotation.y - Math.PI / 2);
    expect(turned).toBeGreaterThan(0.1);
    expect(turned).toBeLessThan(Math.PI / 2);
    for (let step = 2; step <= 40; step += 1) {
      subject.update({ visual: visual({}), heading: { x: -1, z: 0 }, seatHeight: 0, time: step * 0.05 });
    }
    expect(Math.abs(Math.abs(subject.root.rotation.y) - Math.PI / 2)).toBeLessThan(0.05);
  });

  it('setzt sich hin, statt auf die Sitzhöhe zu springen', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.table;
    const seated = visual({ pose: 'reading', seated: true, seatView: 'side', activitySpotKind: 'table' });
    subject.update({ visual: visual({ pose: 'waiting' }), seatHeight: seat, time: 0 });
    subject.update({ visual: seated, seatHeight: seat, time: 0.05 });
    const target = seat - HIP_HEIGHT;
    expect(Math.abs(bodyY(subject) - target)).toBeGreaterThan(Math.abs(target) * 0.3);
    for (let step = 2; step <= 30; step += 1) subject.update({ visual: seated, seatHeight: seat, time: step * 0.05 });
    expect(bodyY(subject)).toBeCloseTo(target, 2);
  });

  it('springt nach einer Pause (Tab im Hintergrund) sofort in die richtige Haltung', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.bench;
    const seated = visual({ pose: 'reading', seated: true, seatView: 'front', activitySpotKind: 'bench' });
    subject.update({ visual: seated, seatHeight: seat, time: 0 });
    expect(bodyY(subject)).toBeCloseTo(seat - HIP_HEIGHT, 5);
    subject.update({ visual: visual({ pose: 'waiting' }), seatHeight: seat, time: 0.05 });
    subject.update({ visual: seated, seatHeight: seat, time: 3 });
    expect(bodyY(subject)).toBeCloseTo(seat - HIP_HEIGHT, 5);
  });

  it('zeigt denselben Augenblick beim zweiten Zeichnen genauso, statt ans Ziel zu springen', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.table;
    const seated = visual({ pose: 'reading', seated: true, seatView: 'side', seatFacing: 1, activitySpotKind: 'table' });
    subject.update({ visual: visual({ pose: 'waiting' }), seatHeight: seat, time: 0 });
    subject.update({ visual: seated, seatView: 'side', seatHeight: seat, time: 0.1 });
    const midway = bodyY(subject);
    const yaw = subject.root.rotation.y;
    subject.update({ visual: seated, seatView: 'side', seatHeight: seat, time: 0.1 });
    expect(bodyY(subject)).toBeCloseTo(midway, 6);
    expect(subject.root.rotation.y).toBeCloseTo(yaw, 6);
    expect(Math.abs(midway - (seat - HIP_HEIGHT))).toBeGreaterThan(0.05);
  });

  it('setzt sich über gut eine halbe Sekunde, beugt dabei die Knie und neigt sich nach vorn', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.table;
    const seated = visual({ pose: 'reading', seated: true, seatView: 'side', seatFacing: 1, activitySpotKind: 'table' });
    subject.update({ visual: visual({ pose: 'waiting' }), seatHeight: seat, time: 0 });
    const heights: number[] = [];
    for (let step = 1; step <= 20; step += 1) {
      subject.update({ visual: seated, seatView: 'side', seatHeight: seat, time: step / 30 });
      heights.push(bodyY(subject));
    }
    // Der Körper sinkt stetig, nicht auf einmal.
    for (let index = 1; index < heights.length; index += 1) expect(heights[index]!).toBeLessThanOrEqual(heights[index - 1]! + 1e-6);
    expect(Math.abs(heights[2]! - (seat - HIP_HEIGHT))).toBeGreaterThan(Math.abs(seat - HIP_HEIGHT) * 0.5);
    for (let step = 21; step <= 60; step += 1) subject.update({ visual: seated, seatView: 'side', seatHeight: seat, time: step / 30 });
    expect(bodyY(subject)).toBeCloseTo(seat - HIP_HEIGHT, 2);
  });
  it('wendet einen seitlich sitzenden Gast nie in die Stuhllehne', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.table;
    // Eine Reaktion schaut nach links, der Stuhl am rechten Tischende blickt aber nach rechts.
    const turned = visual({ pose: 'reading', seated: true, seatView: 'side', seatFacing: 1, facing: -1, activitySpotKind: 'table' });
    for (let step = 0; step <= 40; step += 1) subject.update({ visual: turned, seatView: 'side', seatHeight: seat, time: step * 0.05 });
    expect(subject.root.rotation.y).toBeCloseTo(Math.PI / 2, 2);
  });
  it('dreht sich kurz vor dem Sitzplatz schon zum Stuhl, statt sich erst auf ihm umzudrehen', () => {
    const subject = figure();
    // Der Gast läuft zur Bank am Fenster (weg von der Kamera), setzt sich aber mit Blick zur Kamera.
    const walking = visual({ pose: 'walking' });
    for (let step = 0; step <= 20; step += 1) subject.update({ visual: walking, heading: { x: 0, z: -1 }, seatHeight: 0, time: step * 0.05 });
    expect(Math.abs(Math.abs(subject.root.rotation.y) - Math.PI)).toBeLessThan(0.05);
    for (let step = 21; step <= 60; step += 1) subject.update({ visual: walking, heading: { x: 0, z: -1 }, yawOverride: 0, seatHeight: 0, time: step * 0.05 });
    expect(Math.abs(subject.root.rotation.y)).toBeLessThan(0.05);
  });

  it('leert den Becher mit der Zeit und lässt nur frischen Kaffee dampfen', () => {
    const subject = figure();
    const drinking = visual({ pose: 'drinking', seated: true, seatView: 'side', seatFacing: 1, activitySpotKind: 'table' });
    const pour = (fill: number, steaming: boolean) => {
      subject.update({ visual: drinking, seatView: 'side', seatHeight: SEAT_TOP_HEIGHT.table, time: fill, cupFill: fill, steaming });
      return subject.cupState;
    };
    const full = pour(1, true);
    const half = pour(0.5, false);
    expect(full.coffeeY).toBeGreaterThan(half.coffeeY + 0.03);
    expect(full.steaming).toBe(true);
    expect(half.steaming).toBe(false);
  });
});
