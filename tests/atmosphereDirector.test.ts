import { describe, expect, it } from 'vitest';
import { AtmosphereDirector, eligibleAtmosphereWaves, venueSignatureWave } from '../src/atmosphere/AtmosphereDirector';
import { parseAtmosphereDevelopmentOverrides } from '../src/atmosphere/types';
import type { CafeEnvironmentSnapshot, WeatherKind } from '../src/environment/types';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { SceneSnapshot } from '../src/scene/types';
import type { VenueKind } from '../src/venue';

function environment(kind: WeatherKind = 'clear', hour = 12): CafeEnvironmentSnapshot {
  const date = new Date(`2026-07-16T${String(hour).padStart(2, '0')}:00:00Z`);
  const dark = hour < 6 || hour >= 20;
  return {
    localTime: date,
    localTimeText: `${String(hour).padStart(2, '0')}:00`,
    minuteOfDay: hour * 60,
    dayPhase: dark ? 'night' : hour < 8 ? 'dawn' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    solar: { elevation: dark ? -12 : 38, azimuth: 180, isDay: !dark, isCivilTwilight: false, polarState: 'normal' },
    weather: {
      kind, previousKind: kind, transitionProgress: 1, weatherCode: kind === 'storm' ? 95 : 0,
      cloudCover: kind === 'fog' ? 98 : kind === 'cloudy' ? 86 : 12,
      precipitation: kind === 'rain' || kind === 'storm' || kind === 'snow' ? 2 : 0,
      rain: kind === 'rain' || kind === 'storm' ? 1.4 : 0,
      showers: kind === 'storm' ? 0.8 : 0,
      snowfall: kind === 'snow' ? 1.2 : 0,
      windSpeed: kind === 'storm' ? 32 : 5,
      windGusts: kind === 'storm' ? 58 : 9,
      windDirection: 220, temperature: 12, isDay: !dark, observedAt: date,
    },
    weatherSource: 'override', locationState: 'override', targetCrowd: 4,
  };
}

function scene(venue: VenueKind = 'cafe'): SceneSnapshot {
  const simulation = new CafeSimulation({ venue, initialGuests: 0, accidents: false, moments: false, stories: false });
  return simulation.getSceneSnapshot();
}

function withConflict(snapshot: SceneSnapshot): SceneSnapshot {
  return { ...snapshot, moment: { id: 42 } } as unknown as SceneSnapshot;
}

function observe(
  director: AtmosphereDirector,
  deltaSeconds: number,
  options: { venue?: VenueKind; weather?: WeatherKind; visible?: boolean; reducedMotion?: boolean; conflict?: boolean } = {},
) {
  const venue = options.venue ?? 'cafe';
  const baseScene = scene(venue);
  return director.observe({
    environment: environment(options.weather), venue,
    scene: options.conflict ? withConflict(baseScene) : baseScene,
    deltaSeconds,
    visible: options.visible ?? true,
    reducedMotion: options.reducedMotion ?? false,
  });
}

describe('Atmosphären-Eignung und Entwicklungsparameter', () => {
  it('bindet Wetter- und Tageswellen an reale Umweltwerte', () => {
    expect(eligibleAtmosphereWaves(environment('storm', 22), 'cafe')).toEqual(expect.arrayContaining([
      'traffic-glow', 'rain-surge', 'wind-gust', 'distant-thunder', 'cafe-espresso-cycle',
    ]));
    expect(eligibleAtmosphereWaves(environment('snow'), 'ramen')).toContain('snow-quiet');
    expect(eligibleAtmosphereWaves(environment('fog'), 'arcade')).toContain('fog-glow');
    expect(eligibleAtmosphereWaves(environment('clear'), 'cafe')).toContain('sunbreak');
  });

  it('ignoriert erzwungene Zustände im Produktionsmodus', () => {
    expect(parseAtmosphereDevelopmentOverrides('?atmosphere=rain-surge&atmospherePhase=hold&atmosphereScale=.05', false))
      .toEqual({ scale: 1 });
    expect(parseAtmosphereDevelopmentOverrides('?atmosphere=rain-surge&atmospherePhase=fade-out&atmosphereScale=.05', true))
      .toEqual({ wave: 'rain-surge', phase: 'fade-out', scale: 0.05 });
  });
});

describe('AtmosphereDirector', () => {
  it('beginnt nach 35–55 Sekunden und plant spätere Wellen im 90–150-Sekunden-Fenster', () => {
    const director = new AtmosphereDirector({ firstIntervalSeconds: [35, 35], laterIntervalSeconds: [90, 90], durationSeconds: [8, 8] });
    expect(observe(director, 34.99).wave).toBe('none');
    expect(observe(director, 0.01).wave).not.toBe('none');
    observe(director, 8);
    expect(observe(director, 89.99).wave).toBe('none');
    expect(observe(director, 0.01).wave).not.toBe('none');
  });

  it('erzeugt für gleichen Seed dieselbe Folge ohne direkte Wiederholung und spätestens jede dritte Venue-Signatur', () => {
    const run = (): string[] => {
      const director = new AtmosphereDirector({ seed: 19, firstIntervalSeconds: [1, 1], laterIntervalSeconds: [1, 1], durationSeconds: [1, 1] });
      const waves: string[] = [];
      let active = 'none';
      for (let index = 0; index < 80; index += 1) {
        const snapshot = observe(director, 0.25, { weather: 'storm' });
        if (snapshot.wave !== 'none' && snapshot.wave !== active) waves.push(snapshot.wave);
        active = snapshot.wave;
      }
      return waves;
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.length).toBeGreaterThan(6);
    for (let index = 1; index < first.length; index += 1) expect(first[index]).not.toBe(first[index - 1]);
    for (let index = 0; index <= first.length - 3; index += 3) {
      expect(first.slice(index, index + 3)).toContain(venueSignatureWave('cafe'));
    }
  });

  it('blendet bei Momenten binnen 0,8 Sekunden aus und schützt die folgenden zwölf Sekunden', () => {
    const director = new AtmosphereDirector({
      firstIntervalSeconds: [0.1, 0.1], laterIntervalSeconds: [0, 0], durationSeconds: [20, 20], conflictGuardSeconds: 12,
    });
    const wave = observe(director, 0.2);
    expect(wave.wave).not.toBe('none');
    const conflictStart = observe(director, 0.1, { conflict: true });
    expect(conflictStart.phase).toBe('fade-out');
    expect(observe(director, 0.81, { conflict: true }).wave).toBe('none');
    observe(director, 0);
    expect(observe(director, 11.9).wave).toBe('none');
    expect(observe(director, 0.11).wave).not.toBe('none');
  });

  it('pausiert verdeckte Tabs ohne Zeit- oder Intensitätssprung', () => {
    const director = new AtmosphereDirector({ firstIntervalSeconds: [1, 1], durationSeconds: [12, 12] });
    observe(director, 1.5);
    const before = observe(director, 1);
    const hidden = observe(director, 200, { visible: false });
    expect(hidden.elapsedSeconds).toBe(before.elapsedSeconds);
    expect(hidden.intensity).toBe(before.intensity);
    expect(observe(director, 0).elapsedSeconds).toBe(before.elapsedSeconds);
  });

  it('ersetzt Bewegung bei Reduced Motion durch Überblendung und startet nach Venuewechsel neu', () => {
    const director = new AtmosphereDirector({ firstIntervalSeconds: [1, 1], durationSeconds: [10, 10] });
    const reduced = observe(director, 1.5, { reducedMotion: true });
    expect(reduced.motion).toBe('crossfade');
    expect(observe(director, 0, { venue: 'ramen' }).wave).toBe('none');
    const ramen = observe(director, 1, { venue: 'ramen' });
    expect(ramen.venue).toBe('ramen');
    expect(ramen.wave).not.toBe('cafe-espresso-cycle');
  });

  it('zeigt in zehn beschleunigten Minuten vier bis sieben unterschiedliche Wellen', () => {
    const director = new AtmosphereDirector({ seed: 88 });
    const waves = new Set<string>();
    let last = 'none';
    for (let second = 0; second < 600; second += 0.5) {
      const snapshot = observe(director, 0.5, { weather: 'storm' });
      if (snapshot.wave !== 'none' && snapshot.wave !== last) waves.add(snapshot.wave);
      last = snapshot.wave;
    }
    expect(waves.size).toBeGreaterThanOrEqual(4);
    expect(waves.size).toBeLessThanOrEqual(7);
  });
});
