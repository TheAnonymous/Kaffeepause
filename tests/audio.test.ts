import { describe, expect, it } from 'vitest';
import { clampStereoPan, cuePlaybackRate, REACTION_ACCENT_MAX_GAIN, soundDetailDelayMs } from '../src/audio';

describe('Soundscape-Rhythmus', () => {
  it('begrenzt den dekorativen Reaktionsakzent auf einen kaum hörbaren Pegel', () => {
    expect(REACTION_ACCENT_MAX_GAIN).toBeLessThanOrEqual(0.008);
  });
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

  it('begrenzt ereignisgebundenes Panning und minimale Tonhöhenvariation', () => {
    expect(clampStereoPan(-4)).toBe(-1);
    expect(clampStereoPan(4)).toBe(1);
    expect(cuePlaybackRate([0.975, 1.025], 0)).toBe(0.975);
    expect(cuePlaybackRate([0.975, 1.025], 1)).toBe(1.025);
    expect(cuePlaybackRate([0.975, 1.025], 0.5)).toBe(1);
  });
});
