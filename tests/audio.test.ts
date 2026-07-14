import { describe, expect, it } from 'vitest';
import { soundDetailDelayMs } from '../src/audio';

describe('Soundscape-Rhythmus', () => {
  it('streut kleine Raumdetails über ruhige, ortsabhängige Intervalle', () => {
    expect(soundDetailDelayMs('cafe', 0, 0)).toBe(10_500);
    expect(soundDetailDelayMs('ramen', 0, 1)).toBe(18_000);
    expect(soundDetailDelayMs('arcade', 0, 1)).toBe(19_000);
  });

  it('wird bei mehr Gästen etwas lebendiger, ohne die Geräusche zu verdichten', () => {
    const quietCafe = soundDetailDelayMs('cafe', 0, 0.5);
    const busyCafe = soundDetailDelayMs('cafe', 8, 0.5);

    expect(busyCafe).toBeLessThan(quietCafe);
    expect(busyCafe).toBeGreaterThan(7_000);
  });

  it('begrenzt Zufalls- und Belegungswerte auf einen sicheren Bereich', () => {
    expect(soundDetailDelayMs('cafe', -4, -1)).toBe(10_500);
    expect(soundDetailDelayMs('cafe', 40, 2)).toBe(17_640);
  });
});
