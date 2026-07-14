import { describe, expect, it } from 'vitest';
import { calculateHd2dState } from '../src/scene/hd2dRenderer';
import type { SceneLighting } from '../src/scene/lightingRenderer';

function lighting(overrides: Partial<SceneLighting> = {}): SceneLighting {
  return {
    solar: 0.9,
    wetness: 0,
    night: 0.08,
    fog: 0,
    fromRight: true,
    glow: '#f0b66b',
    reflection: '#d49a61',
    ...overrides,
  };
}

describe('HD-2D-Diorama-Pass', () => {
  it('verstärkt Lichtblüten und Randtiefe bei Nacht und Nässe', () => {
    const day = calculateHd2dState(lighting());
    const nightRain = calculateHd2dState(lighting({ solar: 0, night: 1, wetness: 0.9, fog: 0.4 }));

    expect(nightRain.bloom).toBeGreaterThan(day.bloom);
    expect(nightRain.vignette).toBeGreaterThan(day.vignette);
    expect(nightRain.bokeh).toBeGreaterThan(day.bokeh);
  });

  it('hält alle Bildwerte in einem zeichnbaren Bereich', () => {
    const state = calculateHd2dState(lighting({ solar: 0, night: 1, wetness: 1, fog: 1 }));

    expect(Object.values(state).every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
