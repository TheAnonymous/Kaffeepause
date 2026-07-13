import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/simulation/random';

describe('SeededRandom', () => {
  it('liefert für denselben Seed dieselbe Folge', () => {
    const left = new SeededRandom(20260713);
    const right = new SeededRandom(20260713);
    expect(Array.from({ length: 12 }, () => left.next())).toEqual(Array.from({ length: 12 }, () => right.next()));
  });

  it('hält Ganzzahlen in den angegebenen Grenzen', () => {
    const random = new SeededRandom(7);
    const values = Array.from({ length: 100 }, () => random.integer(3, 6));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values)).toBeLessThanOrEqual(6);
  });
});
