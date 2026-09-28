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

  it('zeigt auf Standbildern sofort die richtige Haltung', () => {
    const subject = figure();
    const seat = SEAT_TOP_HEIGHT.bench;
    const seated = visual({ pose: 'reading', seated: true, seatView: 'front', activitySpotKind: 'bench' });
    subject.update({ visual: visual({ pose: 'waiting' }), seatHeight: seat, time: 0 });
    subject.update({ visual: seated, seatHeight: seat, time: 0 });
    expect(bodyY(subject)).toBeCloseTo(seat - HIP_HEIGHT, 5);
  });
});
