import { describe, expect, it } from 'vitest';
import { CAFE_LAYOUT_REPORT, validateCafeLayout } from '../src/simulation/layout';
import {
  SCENE_PROPORTIONS,
  SCENE_PROPORTION_REPORT,
  type SceneProportions,
  validateSceneProportions,
} from '../src/scene/proportions';

describe('Szenenproportionen', () => {
  it('hält Figuren, Tische, Theke, Tür und Tiefenebenen in einer gemeinsamen Maßsprache', () => {
    expect(SCENE_PROPORTION_REPORT.valid).toBe(true);
    expect(SCENE_PROPORTION_REPORT.score).toBe(100);
    expect(SCENE_PROPORTION_REPORT.issues).toEqual([]);
    expect(SCENE_PROPORTION_REPORT.ratios.tableToCharacter).toBeGreaterThan(0.22);
    expect(SCENE_PROPORTION_REPORT.ratios.counterToHost).toBeLessThan(0.58);
    expect(SCENE_PROPORTION_REPORT.ratios.walkwayInBodies).toBeGreaterThan(2.5);
  });

  it('meldet eine zu hohe Arbeitskante automatisch', () => {
    const invalid: SceneProportions = {
      ...SCENE_PROPORTIONS,
      counter: { ...SCENE_PROPORTIONS.counter, surfaceY: 112 },
    };
    const report = validateSceneProportions(invalid);

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('counter-height');
  });

  it('prüft auch Kollider, Sitzplätze und Laufziele gegen das sichtbare Layout', () => {
    expect(CAFE_LAYOUT_REPORT).toEqual(validateCafeLayout());
    expect(CAFE_LAYOUT_REPORT.valid).toBe(true);
    expect(CAFE_LAYOUT_REPORT.score).toBe(100);
  });
});
