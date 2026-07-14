import { describe, expect, it } from 'vitest';
import { calculateDefaultSolarState, calculateSolarState, dayPhaseFor } from '../src/environment/solar';

describe('Sonnenstand', () => {
  it('liegt an einem NOAA-Referenzpunkt innerhalb eines Grades', () => {
    // NOAA Solar Calculator: Boulder-Region, 21.06.2024 19:00 UTC.
    const solar = calculateSolarState(new Date('2024-06-21T19:00:00Z'), { latitude: 40, longitude: -105 });
    expect(solar.elevation).toBeCloseTo(73.4, 0);
    expect(solar.azimuth).toBeCloseTo(178.5, 0);
    expect(solar.isDay).toBe(true);
  });

  it('berücksichtigt unterschiedliche Sommerzeit-Offsets als unterschiedliche Instante', () => {
    const coordinates = { latitude: 59.91, longitude: 10.75 };
    const beforeOffset = calculateSolarState(new Date('2026-03-29T03:30:00+01:00'), coordinates);
    const summerOffset = calculateSolarState(new Date('2026-03-29T03:30:00+02:00'), coordinates);
    expect(Math.abs(beforeOffset.elevation - summerOffset.elevation)).toBeGreaterThan(4);
  });

  it('erkennt Polartag und Polarnacht', () => {
    const longyearbyen = { latitude: 78.22, longitude: 15.65 };
    const polarDay = calculateSolarState(new Date('2026-06-21T12:00:00Z'), longyearbyen);
    const polarNight = calculateSolarState(new Date('2026-12-21T12:00:00Z'), longyearbyen);
    expect(polarDay.polarState).toBe('polar-day');
    expect(polarNight.polarState).toBe('polar-night');
    expect(dayPhaseFor(new Date(2026, 11, 21, 12, 0), polarNight)).toBe('night');
  });

  it('bildet Dämmerung und die lokale Ersatzkurve ab', () => {
    const date = new Date(2026, 6, 14, 5, 30);
    const fallback = calculateDefaultSolarState(date);
    expect(Number.isFinite(fallback.elevation)).toBe(true);
    expect(dayPhaseFor(date, { ...fallback, elevation: -3, azimuth: 80, isDay: false, isCivilTwilight: true }))
      .toBe('dawn');
    expect(dayPhaseFor(new Date(2026, 6, 14, 21, 0), { ...fallback, elevation: -3, azimuth: 280, isDay: false, isCivilTwilight: true }))
      .toBe('dusk');
  });
});
