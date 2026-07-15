import { describe, expect, it } from 'vitest';
import { venueMomentPool } from '../src/simulation/momentRegistry';
import { SessionPacingDirector, sessionActAt, sessionDelayRange } from '../src/simulation/sessionPacing';

describe('SessionPacingDirector', () => {
  it('bildet die vier Akte und ihre Abstandsfenster ab', () => {
    expect([sessionActAt(0), sessionActAt(119.9), sessionActAt(120), sessionActAt(420), sessionActAt(720)]).toEqual([
      'arrival', 'arrival', 'settle', 'crescendo', 'afterglow',
    ]);
    expect(sessionDelayRange('settle')).toEqual([55, 85]);
    expect(sessionDelayRange('afterglow')).toEqual([70, 110]);
  });

  it('liefert für gleichen Seed dieselbe Reihenfolge, alterniert Kategorien und erschöpft den Pool vor Wiederholung', () => {
    const left = new SessionPacingDirector(91);
    const right = new SessionPacingDirector(91);
    const pool = venueMomentPool('arcade');
    const leftKinds: string[] = [];
    const rightKinds: string[] = [];
    const categories: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const elapsed = 130 + index * 70;
      const a = left.choose(elapsed, 'arcade', pool);
      const b = right.choose(elapsed, 'arcade', pool);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      leftKinds.push(a!.kind);
      rightKinds.push(b!.kind);
      categories.push(a!.category);
      left.completed(elapsed, a!.category);
      right.completed(elapsed, b!.category);
    }
    expect(leftKinds).toEqual(rightKinds);
    expect(new Set(leftKinds).size).toBe(6);
    expect(categories).toEqual(['ritual', 'encounter', 'ritual', 'encounter', 'ritual', 'encounter']);
  });

  it('bevorzugt im Crescendo den verfügbaren Höhepunkt und begrenzt Arrival auf ein Ritual', () => {
    const director = new SessionPacingDirector(4);
    const cafe = venueMomentPool('cafe');
    const first = director.choose(80, 'cafe', cafe);
    expect(first?.category).toBe('ritual');
    director.completed(90, first!.category);
    expect(director.choose(100, 'cafe', cafe)).toBeUndefined();
    expect(director.choose(430, 'cafe', cafe)?.kind).toBe('window-rain-trace');
  });
});
