import { describe, expect, it } from 'vitest';
import { opticsForVenue } from '../src/scene/venueOpticsRenderer';

describe('Ortsoptik', () => {
  it('gibt jedem Ort eigene Licht-, Schild- und Vordergrundfarben', () => {
    const cafe = opticsForVenue('cafe');
    const ramen = opticsForVenue('ramen');
    const arcade = opticsForVenue('arcade');

    expect(cafe.glow).toBe('#efba70');
    expect(ramen.sign).toBe('#c9514c');
    expect(arcade.reflection).toBe('#70d9d2');
    expect(new Set([cafe.foreground, ramen.foreground, arcade.foreground]).size).toBe(3);
  });
});
