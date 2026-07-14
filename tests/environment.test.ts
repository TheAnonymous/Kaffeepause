import { afterEach, describe, expect, it, vi } from 'vitest';
import { CafeEnvironmentController, parseEnvironmentOverrides } from '../src/environment/cafeEnvironmentController';
import { baseCrowdTarget, correctedCrowdTarget } from '../src/environment/crowd';
import type { WeatherObservation } from '../src/environment/types';
import {
  deterministicFallbackWeather,
  fetchOpenMeteo,
  openMeteoUrl,
  parseOpenMeteoResponse,
  weatherKindForCode,
} from '../src/environment/weather';

function weather(kind: WeatherObservation['kind'] = 'clear', gusts = 8): WeatherObservation {
  return {
    kind,
    previousKind: kind,
    transitionProgress: 1,
    weatherCode: kind === 'storm' ? 95 : 0,
    cloudCover: 10,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    windSpeed: 5,
    windGusts: gusts,
    windDirection: 180,
    temperature: 18,
    isDay: true,
    observedAt: new Date('2026-07-14T12:00:00Z'),
  };
}

function livePayload(code = 61): Record<string, unknown> {
  return {
    current: {
      time: '2026-07-14T12:00',
      weather_code: code,
      cloud_cover: 82,
      temperature_2m: 13.4,
      precipitation: 2.1,
      rain: 1.7,
      showers: 0.4,
      snowfall: 0,
      wind_speed_10m: 23,
      wind_direction_10m: 245,
      wind_gusts_10m: 41,
      is_day: 1,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Belegungsprofil', () => {
  it('interpoliert alle Anker und Zeitgrenzen', () => {
    expect(baseCrowdTarget(0)).toBe(0);
    expect(baseCrowdTarget(330)).toBe(0);
    expect(baseCrowdTarget(420)).toBe(3);
    expect(baseCrowdTarget(510)).toBe(8);
    expect(baseCrowdTarget(750)).toBe(8);
    expect(baseCrowdTarget(1440)).toBe(0);
  });

  it('korrigiert Wetter nur in den vorgesehenen Zeitfenstern', () => {
    expect(correctedCrowdTarget(750, weather('rain'))).toBe(8);
    expect(correctedCrowdTarget(990, weather('snow'))).toBe(4);
    expect(correctedCrowdTarget(1_200, weather('storm', 60))).toBe(2);
    expect(correctedCrowdTarget(1_380, weather('rain'))).toBeLessThanOrEqual(1);
    expect(correctedCrowdTarget(300, weather('storm', 60))).toBe(0);
  });

  it('verhindert Flattern mit einer 0,6-Gast-Hysterese', () => {
    expect(correctedCrowdTarget(397, weather(), 1)).toBe(1);
    expect(correctedCrowdTarget(400, weather(), 1)).toBe(2);
  });
});

describe('Wetterdaten', () => {
  it.each([
    [0, 'clear'], [2, 'cloudy'], [45, 'fog'], [63, 'rain'], [75, 'snow'], [96, 'storm'],
  ] as const)('ordnet WMO-Code %i %s zu', (code, kind) => {
    expect(weatherKindForCode(code)).toBe(kind);
  });

  it('parst alle verwendeten Open-Meteo-Felder', () => {
    const parsed = parseOpenMeteoResponse(livePayload(), new Date('2026-07-14T12:01:00Z'));
    expect(parsed).toMatchObject({ kind: 'rain', cloudCover: 82, rain: 1.7, windGusts: 41, windDirection: 245 });
    expect(() => parseOpenMeteoResponse({ current: { weather_code: 61 } }, new Date())).toThrow(/Open-Meteo-Feld/);
    expect(() => weatherKindForCode(120)).toThrow(/WMO/);
  });

  it('rundet Koordinaten vor dem Request auf zwei Dezimalstellen', () => {
    const url = new URL(openMeteoUrl({ latitude: 59.913_868, longitude: 10.752_245 }));
    expect(url.searchParams.get('latitude')).toBe('59.91');
    expect(url.searchParams.get('longitude')).toBe('10.75');
    expect(url.searchParams.get('current')).toContain('weather_code');
  });

  it('bricht einen hängenden Request nach fünf Sekunden ab', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const request = fetchOpenMeteo(fetcher, { latitude: 59.91, longitude: 10.75 }, new Date());
    const assertion = expect(request).rejects.toThrow(/aborted/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('liefert pro Datum, Standort und Abschnitt denselben Fallback', () => {
    const date = new Date(2026, 6, 14, 6, 5);
    const first = deterministicFallbackWeather(date, 'Europe/Oslo');
    const second = deterministicFallbackWeather(new Date(date), 'Europe/Oslo');
    expect(second).toEqual(first);
    expect(first.transitionProgress).toBeCloseTo(0.5, 5);
  });
});

describe('CafeEnvironmentController', () => {
  it('fragt Standort sofort mit den datensparsamen Optionen ab und lädt Live-Wetter', async () => {
    let success: PositionCallback | undefined;
    let requestedOptions: PositionOptions | undefined;
    const geolocation = {
      getCurrentPosition: (next: PositionCallback, _error?: PositionErrorCallback | null, options?: PositionOptions) => {
        success = next;
        requestedOptions = options;
      },
    };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(livePayload()), { status: 200 }));
    const controller = new CafeEnvironmentController({
      now: () => new Date('2026-07-14T12:00:00Z'),
      geolocation,
      fetcher,
    });
    controller.start();
    expect(requestedOptions).toEqual({ enableHighAccuracy: false, maximumAge: 1_800_000, timeout: 8_000 });
    success?.({ coords: { latitude: 59.913_868, longitude: 10.752_245 } } as GeolocationPosition);
    await vi.waitFor(() => expect(controller.getSnapshot().weatherSource).toBe('live'));
    expect(controller.getSnapshot()).toMatchObject({
      locationState: 'granted',
      coordinates: { latitude: 59.91, longitude: 10.75 },
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('latitude=59.91');
    controller.stop();
  });

  it('kündigt Ablehnung einmal an und bleibt vollständig im Fallback', () => {
    const notices: string[] = [];
    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.({ code: 1 } as GeolocationPositionError);
      },
    };
    const controller = new CafeEnvironmentController({ geolocation, onNotice: (message) => notices.push(message) });
    controller.start();
    expect(controller.getSnapshot()).toMatchObject({ locationState: 'denied', weatherSource: 'fallback' });
    expect(notices).toHaveLength(1);
    controller.stop();
  });

  it('behält nach einem Folgefehler die letzte gültige Beobachtung', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(livePayload()), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('offline'));
    const controller = new CafeEnvironmentController({
      now: () => new Date('2026-07-14T12:00:00Z'),
      overrides: { coordinates: { latitude: 59.91, longitude: 10.75 } },
      fetcher,
    });
    controller.start();
    await vi.waitFor(() => expect(controller.getSnapshot().weatherSource).toBe('live'));
    await controller.refreshWeather();
    expect(controller.getSnapshot().weatherSource).toBe('live');
    expect(controller.getSnapshot().weather.kind).toBe('rain');
    controller.stop();
  });

  it('akzeptiert kombinierbare Overrides ausschließlich im Entwicklungsmodus', () => {
    expect(parseEnvironmentOverrides('?time=07:30&weather=snow&lat=78.223&lon=15.646', true)).toEqual({
      time: { hours: 7, minutes: 30 },
      weather: 'snow',
      coordinates: { latitude: 78.22, longitude: 15.65 },
    });
    expect(parseEnvironmentOverrides('?time=07:30&weather=snow&lat=78.223&lon=15.646', false)).toEqual({});
  });
});
