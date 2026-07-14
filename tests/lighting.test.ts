import { describe, expect, it } from 'vitest';
import type { CafeEnvironmentSnapshot, DayPhase, WeatherKind } from '../src/environment/types';
import { observationForOverride } from '../src/environment/weather';
import { calculateSceneLighting } from '../src/scene/lightingRenderer';

function environment(dayPhase: DayPhase, elevation: number, azimuth: number, weatherKind: WeatherKind): CafeEnvironmentSnapshot {
  const localTime = new Date(2026, 6, 14, 12, 30);
  return {
    localTime,
    localTimeText: '12:30',
    minuteOfDay: 750,
    dayPhase,
    solar: { elevation, azimuth, isDay: elevation >= 0, isCivilTwilight: elevation >= -6 && elevation < 0, polarState: 'normal' },
    weather: observationForOverride(weatherKind, localTime),
    weatherSource: 'override',
    locationState: 'override',
    targetCrowd: 4,
  };
}

describe('Szenenlicht', () => {
  it('setzt Sonnenlicht und Fensterseite aus der lokalen Umgebung ab', () => {
    const light = calculateSceneLighting('cafe', environment('midday', 54, 236, 'clear'));

    expect(light.solar).toBeGreaterThan(0.9);
    expect(light.fromRight).toBe(true);
    expect(light.night).toBeLessThan(0.1);
    expect(light.glow).toBe('#f0b66b');
  });

  it('macht nasse, dunstige Szenen sichtbar, ohne das Ortslicht zu verlieren', () => {
    const light = calculateSceneLighting('ramen', environment('evening', -4, 122, 'rain'));
    const fog = calculateSceneLighting('arcade', environment('night', -10, 180, 'fog'));

    expect(light.wetness).toBeGreaterThan(0.8);
    expect(light.night).toBeGreaterThan(0.5);
    expect(light.reflection).toBe('#d45c4d');
    expect(fog.fog).toBe(1);
    expect(fog.glow).toBe('#5cced0');
  });
});
