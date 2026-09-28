import { describe, expect, it } from 'vitest';
import { parseSeasonOverride, seasonForDate } from '../src/diorama/season';
import { CafeCat, CAT_VISIT_SECONDS, catStateAt, catVisitState } from '../src/diorama/cafeCat';

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

  it('hüpft beim Besuch von der Bank auf den Boden und schaut zur Kamera', () => {
    const onBench = catStateAt(10);
    const sitting = catVisitState(onBench, 3);
    expect(sitting.pose).toBe('sit');
    expect(sitting.position.y).toBeLessThan(0.2);
    expect(sitting.towardViewer).toBe(true);
    expect(catVisitState(onBench, CAT_VISIT_SECONDS - 0.001).position.y).toBeGreaterThan(0.5);
  });

  it('macht nach dem Besuch genau dort weiter, wo sie war', () => {
    const cat = new CafeCat();
    const never = (): boolean => false;
    cat.update(20, false, never);
    const before = cat.root.position.clone();
    expect(cat.summon(20, false)).toBe(true);
    expect(cat.summon(21, false)).toBe(false);
    cat.update(23, false, never);
    expect(cat.root.position.y).toBeLessThan(0.2);
    cat.update(20 + CAT_VISIT_SECONDS + 0.01, false, never);
    expect(cat.root.position.distanceTo(before)).toBeLessThan(0.01);
    cat.dispose();
  });
});
