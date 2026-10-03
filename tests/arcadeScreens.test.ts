import { describe, expect, it } from 'vitest';
import { buildVenue } from '../src/diorama/venueBuilder';
import { ARCADE_GAMES, ArcadeScreen } from '../src/diorama/arcadeScreens';

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

  it('zeigt ohne Spieler eine Demo, beim Start einen Blitz, beim Weggehen Game Over und dann wieder die Demo', () => {
    const screen = new ArcadeScreen('invaders', '#83f2ee', 0.8, 0.5);
    screen.update(1, { playing: false });
    expect(screen.mode).toBe('demo');
    screen.update(2, { playing: true });
    expect(screen.mode).toBe('start');
    screen.update(3, { playing: true });
    expect(screen.mode).toBe('play');
    screen.update(10, { playing: false });
    expect(screen.mode).toBe('over');
    screen.update(14, { playing: false });
    expect(screen.mode).toBe('demo');
    screen.dispose();
  });

  it('jubelt beim Highscore, spinnt in der Geschichte und bleibt bei reduzierter Bewegung ruhig', () => {
    const screen = new ArcadeScreen('racer', '#ff9b70', 0.8, 0.5);
    screen.update(1, { playing: true, celebrating: true });
    expect(screen.mode).toBe('celebrate');
    screen.update(2, { playing: true, glitching: true });
    expect(screen.mode).toBe('glitch');
    screen.update(3, { playing: false, still: true });
    expect(screen.mode).toBe('demo');
    screen.update(4, { playing: true, still: true });
    expect(screen.mode).toBe('play');
    screen.dispose();
  });
});
