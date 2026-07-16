import { describe, expect, it } from 'vitest';
import { calculateDioramaLook } from '../src/diorama/look';
import {
  DIORAMA,
  DIORAMA_SCALE_REPORT,
  validateDioramaScale,
  worldToCharacterDiorama,
  worldToDiorama,
} from '../src/diorama/types';
import type { CafeEnvironmentSnapshot, DayPhase, WeatherKind } from '../src/environment/types';
import { observationForOverride } from '../src/environment/weather';
import type { VenueKind } from '../src/venue';

function environment(
  dayPhase: DayPhase,
  weather: WeatherKind,
  previousKind: WeatherKind = weather,
  transitionProgress = 1,
  cloudCover = 0,
): CafeEnvironmentSnapshot {
  const localTime = new Date('2026-07-14T12:30:00Z');
  return {
    localTime,
    localTimeText: '12:30',
    minuteOfDay: 750,
    dayPhase,
    solar: { elevation: 45, azimuth: 220, isDay: dayPhase !== 'night', isCivilTwilight: false, polarState: 'normal' },
    weather: { ...observationForOverride(weather, localTime), previousKind, transitionProgress, cloudCover },
    weatherSource: 'override',
    locationState: 'override',
    targetCrowd: 4,
  };
}

describe('physical diorama scale', () => {
  it('keeps people, furniture, door and walkways in one scale system', () => {
    expect(DIORAMA_SCALE_REPORT.valid).toBe(true);
    expect(DIORAMA_SCALE_REPORT.score).toBe(100);
    expect(validateDioramaScale().issues).toEqual([]);
    expect(DIORAMA).toMatchObject({ standingHeight: 2.14, seatedHeight: 1.67 });
  });

  it('maps simulation coordinates monotonically into the physical floor', () => {
    const backLeft = worldToDiorama({ x: 0, y: 130 });
    const frontRight = worldToDiorama({ x: 384, y: 216 });
    expect(backLeft).toEqual({ x: -8, z: -3.6 });
    expect(frontRight).toEqual({ x: 8, z: 3.6 });
  });

  it('keeps service positions visually in front of the back wall without changing world mapping', () => {
    expect(worldToDiorama({ x: 268, y: 124 }).z).toBeLessThan(-3.6);
    expect(worldToCharacterDiorama({ x: 268, y: 124 }).z).toBe(-3.2);
  });
});

describe('diorama look direction', () => {
  it('gives the neon venue more bloom than the café under the same default light', () => {
    expect(calculateDioramaLook('arcade').bloom).toBeGreaterThan(calculateDioramaLook('cafe').bloom);
  });

  it('derives every light value from the central daylight curve', () => {
    const look = calculateDioramaLook('cafe', environment('midday', 'clear'));

    expect(look.daylight).toBe(1);
    expect(look.exposure).toBeCloseTo(1.25, 6);
    expect(look.ambientIntensity).toBeCloseTo(1.58, 6);
    expect(look.keyIntensity).toBeCloseTo(4.15, 6);
    expect(look.practicalIntensity).toBeCloseTo(28, 6);
    expect(look.characterEmissive).toBeCloseTo(0.045, 6);
    expect(look.shadowLift).toBeCloseTo(0.06, 6);
    expect(look.vignette).toBeCloseTo(0.045, 6);
    expect(look.lightPoolOpacity).toBeCloseTo(0.035, 6);
  });

  it.each([
    ['cafe', 0.98],
    ['ramen', 0.98],
    ['arcade', 1.01],
  ] as const)('uses the %s saturation and adds only the bounded night lift', (venue, base) => {
    const day = calculateDioramaLook(venue, environment('midday', 'clear'));
    const night = calculateDioramaLook(venue, environment('night', 'clear'));

    expect(day.saturation).toBeCloseTo(base, 6);
    expect(night.saturation).toBeCloseTo(base + night.night * 0.035, 6);
    expect(night.saturation).toBeLessThanOrEqual(base + 0.035);
  });

  it('caps arcade bloom peaks and character emissive light', () => {
    const look = calculateDioramaLook('arcade', environment('night', 'storm', 'storm', 1, 100));

    expect(look.bloom).toBeCloseTo(0.3, 4);
    expect(look.characterEmissive).toBeLessThanOrEqual(0.31);
    expect(look.characterEmissive).toBeGreaterThan(0.26);
  });

  it('keeps weather transitions inside all rendering bounds', () => {
    const venues: readonly VenueKind[] = ['cafe', 'ramen', 'arcade'];
    const phases: readonly DayPhase[] = ['night', 'dawn', 'morning', 'midday', 'afternoon', 'dusk', 'evening'];
    for (const venue of venues) {
      for (const phase of phases) {
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const look = calculateDioramaLook(venue, environment(phase, 'storm', 'clear', progress, 100));
          expect(look.exposure).toBeGreaterThanOrEqual(1.13);
          expect(look.exposure).toBeLessThanOrEqual(1.56);
          expect(look.ambientIntensity).toBeGreaterThanOrEqual(1.3);
          expect(look.ambientIntensity).toBeLessThanOrEqual(2.35);
          expect(look.keyIntensity).toBeGreaterThanOrEqual(1.15);
          expect(look.keyIntensity).toBeLessThanOrEqual(4.15);
          expect(look.practicalIntensity).toBeGreaterThanOrEqual(28);
          expect(look.practicalIntensity).toBeLessThanOrEqual(62);
          expect(look.characterEmissive).toBeGreaterThanOrEqual(0.045);
          expect(look.characterEmissive).toBeLessThanOrEqual(0.3);
          expect(look.shadowLift).toBeGreaterThanOrEqual(0.045);
          expect(look.shadowLift).toBeLessThanOrEqual(0.2);
          expect(look.vignette).toBeGreaterThanOrEqual(0.045);
          expect(look.vignette).toBeLessThanOrEqual(0.07);
          expect(look.lightPoolOpacity).toBeGreaterThanOrEqual(0.035);
          expect(look.lightPoolOpacity).toBeLessThanOrEqual(0.13);
          expect(0.006 + look.fog * 0.038).toBeLessThanOrEqual(0.044);
          expect(0.55 - look.wetness * 0.2).toBeGreaterThanOrEqual(0.35);
          expect(0.08 + look.wetness * 0.14).toBeLessThanOrEqual(0.22);
        }
      }
    }
  });
});
