import { describe, expect, it } from 'vitest';
import { activitySpotById, VENUE_LAYOUTS } from '../src/simulation/layout';
import { appearanceForGuestNumber } from '../src/simulation/appearance';
import { approachYawFor } from '../src/diorama/characterVisualState';
import { runSweep } from './support/sweep';

function angleBetween(a: number, b: number): number {
  const difference = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

describe('Hinsetzen', () => {
  it.each(['cafe', 'ramen'] as const)('%s: Gäste stehen beim Hinsetzen schon zum Stuhl und drehen sich nicht erst auf ihm', (venue) => {
    const wasSeated = new Map<string, boolean>();
    let sitDowns = 0;
    let worst = 0;
    runSweep({ venue, seconds: 600, timeStep: 1 / 30, durationScale: 0.05 }, ({ figures }) => {
      for (const figure of figures) {
        if (figure.barista) continue;
        if (figure.seated && !wasSeated.get(figure.id) && figure.seatYaw !== undefined) {
          sitDowns += 1;
          worst = Math.max(worst, angleBetween(figure.yaw, figure.seatYaw));
        }
        wasSeated.set(figure.id, figure.seated);
      }
    });
    expect(sitDowns).toBeGreaterThan(5);
    expect(worst).toBeLessThan(0.35);
  }, 60_000);

  it('dreht sich nur auf den letzten Schritten und nur beim Weg zu einem Sitzplatz', () => {
    const layout = VENUE_LAYOUTS.cafe;
    const bench = layout.activitySpots.find((spot) => spot.kind === 'bench');
    expect(bench).toBeDefined();
    expect(activitySpotById(layout, bench!.id)).toBe(bench);
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
  });
});
