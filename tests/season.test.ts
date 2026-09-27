import { describe, expect, it } from 'vitest';
import { parseSeasonOverride, seasonForDate } from '../src/diorama/season';
import { catStateAt } from '../src/diorama/cafeCat';

describe('Jahreszeiten-Deko', () => {
  it.each([
    ['2026-10-14', 'none'],
    ['2026-10-15', 'halloween'],
    ['2026-11-01', 'halloween'],
    ['2026-11-02', 'none'],
    ['2026-12-01', 'winter-lights'],
    ['2027-01-06', 'winter-lights'],
    ['2027-01-07', 'none'],
  ] as const)('ordnet den %s %s zu', (date, season) => {
    expect(seasonForDate(new Date(`${date}T12:00:00`))).toBe(season);
  });

  it('erlaubt die Vorschau nur im Entwicklungsserver', () => {
    expect(parseSeasonOverride('?season=halloween', true)).toBe('halloween');
    expect(parseSeasonOverride('?season=halloween', false)).toBeUndefined();
    expect(parseSeasonOverride('?season=unsinn', true)).toBeUndefined();
  });
});

describe('Café-Katze', () => {
  it('schläft beim Betreten und bei reduzierter Bewegung', () => {
    expect(catStateAt(0).pose).toBe('sleep');
    expect(catStateAt(90, true).pose).toBe('sleep');
  });

  it('läuft zur Vitrine und kommt zurück auf die Bank', () => {
    const atCase = catStateAt(100);
    expect(atCase.pose).toBe('sit');
    expect(atCase.position.x).toBeGreaterThan(2);
    expect(catStateAt(90).pose).toMatch(/^walk/);
    expect(catStateAt(130).facing).toBe(-1);
    expect(catStateAt(149).position).toEqual(catStateAt(0).position);
  });
});
