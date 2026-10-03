import { describe, expect, it } from 'vitest';
import { buildVenue } from '../src/diorama/venueBuilder';
import { ARCADE_GAMES } from '../src/diorama/arcadeScreens';

describe('Bildschirme der Automaten', () => {
  it('zeigt auf jedem der sechs Automaten ein eigenes Spiel', () => {
    const set = buildVenue('arcade');
    expect(set.screens).toHaveLength(6);
    expect(new Set(set.screens.map((screen) => screen.game)).size).toBe(ARCADE_GAMES.length);
    for (const screen of set.screens) expect(() => screen.update(12.3)).not.toThrow();
    set.dispose();
  });

  it('hat nur in der Arcade Spielbildschirme', () => {
    for (const venue of ['cafe', 'ramen'] as const) {
      const set = buildVenue(venue);
      expect(set.screens).toHaveLength(0);
      set.dispose();
    }
  });
});
