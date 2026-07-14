import type { Coordinates, WeatherKind, WeatherObservation } from './types';

export const OPEN_METEO_CURRENT_FIELDS = [
  'weather_code',
  'cloud_cover',
  'temperature_2m',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'is_day',
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Ungültiges Open-Meteo-Feld: ${field}`);
  return value;
}

export function weatherKindForCode(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  throw new Error(`Unbekannter WMO-Wettercode: ${code}`);
}

export function parseOpenMeteoResponse(payload: unknown, receivedAt: Date): WeatherObservation {
  if (!payload || typeof payload !== 'object') throw new Error('Open-Meteo-Antwort ist kein Objekt.');
  const current = (payload as { current?: unknown }).current;
  if (!current || typeof current !== 'object') throw new Error('Open-Meteo-Antwort enthält keine aktuellen Werte.');
  const values = current as Record<string, unknown>;
  const weatherCode = finiteNumber(values.weather_code, 'weather_code');
  const kind = weatherKindForCode(weatherCode);
  const isDay = finiteNumber(values.is_day, 'is_day');
  if (isDay !== 0 && isDay !== 1) throw new Error('Ungültiges Open-Meteo-Feld: is_day');
  const time = typeof values.time === 'string' ? new Date(values.time) : receivedAt;
  const observedAt = Number.isFinite(time.getTime()) ? time : receivedAt;

  return {
    kind,
    previousKind: kind,
    transitionProgress: 1,
    weatherCode,
    cloudCover: clamp(finiteNumber(values.cloud_cover, 'cloud_cover'), 0, 100),
    temperature: clamp(finiteNumber(values.temperature_2m, 'temperature_2m'), -90, 65),
    precipitation: clamp(finiteNumber(values.precipitation, 'precipitation'), 0, 100),
    rain: clamp(finiteNumber(values.rain, 'rain'), 0, 100),
    showers: clamp(finiteNumber(values.showers, 'showers'), 0, 100),
    snowfall: clamp(finiteNumber(values.snowfall, 'snowfall'), 0, 100),
    windSpeed: clamp(finiteNumber(values.wind_speed_10m, 'wind_speed_10m'), 0, 300),
    windDirection: ((finiteNumber(values.wind_direction_10m, 'wind_direction_10m') % 360) + 360) % 360,
    windGusts: clamp(finiteNumber(values.wind_gusts_10m, 'wind_gusts_10m'), 0, 400),
    isDay: isDay === 1,
    observedAt,
  };
}

export function openMeteoUrl(coordinates: Coordinates): string {
  const latitude = coordinates.latitude.toFixed(2);
  const longitude = coordinates.longitude.toFixed(2);
  const query = new URLSearchParams({
    latitude,
    longitude,
    current: OPEN_METEO_CURRENT_FIELDS.join(','),
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'auto',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

export async function fetchOpenMeteo(
  fetcher: typeof fetch,
  coordinates: Coordinates,
  receivedAt: Date,
  timeoutMs = 5_000,
): Promise<WeatherObservation> {
  const abortController = new AbortController();
  const timeout = globalThis.setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetcher(openMeteoUrl(coordinates), {
      headers: { Accept: 'application/json' },
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`Open-Meteo antwortete mit HTTP ${response.status}.`);
    return parseOpenMeteoResponse(await response.json(), receivedAt);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function hashString(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number, offset: number): number {
  let value = (seed + Math.imul(offset + 1, 0x9e37_79b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function fallbackForBlock(date: Date, locationKey: string, block: number): WeatherObservation {
  const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const seed = hashString(`${dayKey}|${locationKey}`);
  const roll = randomFrom(seed, block);
  const winter = date.getMonth() <= 1 || date.getMonth() >= 10;
  const kind: WeatherKind = roll < 0.29
    ? 'clear'
    : roll < 0.52
      ? 'cloudy'
      : roll < 0.59
        ? 'fog'
        : roll < 0.82
          ? (winter && randomFrom(seed, block + 31) > 0.52 ? 'snow' : 'rain')
          : roll < 0.94
            ? 'cloudy'
            : 'storm';
  const precipitation = kind === 'rain' || kind === 'storm' ? 0.4 + randomFrom(seed, block + 8) * 4.8 : kind === 'snow' ? 0.2 : 0;
  const snowfall = kind === 'snow' ? 0.15 + randomFrom(seed, block + 15) * 1.5 : 0;
  const windSpeed = 4 + randomFrom(seed, block + 4) * (kind === 'storm' ? 70 : 26);
  const windGusts = windSpeed + randomFrom(seed, block + 5) * (kind === 'storm' ? 42 : 16);
  const code = kind === 'clear' ? 0 : kind === 'cloudy' ? 3 : kind === 'fog' ? 45 : kind === 'rain' ? 61 : kind === 'snow' ? 73 : 95;
  return {
    kind,
    previousKind: kind,
    transitionProgress: 1,
    weatherCode: code,
    cloudCover: kind === 'clear' ? 4 + roll * 25 : kind === 'cloudy' ? 58 + roll * 34 : kind === 'fog' ? 88 : 82,
    precipitation,
    rain: kind === 'rain' || kind === 'storm' ? precipitation * 0.75 : 0,
    showers: kind === 'rain' || kind === 'storm' ? precipitation * 0.25 : 0,
    snowfall,
    windSpeed,
    windGusts,
    windDirection: randomFrom(seed, block + 6) * 360,
    temperature: (winter ? -4 : 10) + randomFrom(seed, block + 3) * (winter ? 13 : 17),
    isDay: date.getHours() >= 7 && date.getHours() < 20,
    observedAt: date,
  };
}

function interpolate(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

export function blendWeather(
  previous: WeatherObservation,
  current: WeatherObservation,
  progress: number,
): WeatherObservation {
  const amount = clamp(progress, 0, 1);
  const eased = amount * amount * (3 - 2 * amount);
  const directionDelta = ((current.windDirection - previous.windDirection + 540) % 360) - 180;
  return {
    ...current,
    previousKind: previous.kind,
    transitionProgress: amount,
    cloudCover: interpolate(previous.cloudCover, current.cloudCover, eased),
    precipitation: interpolate(previous.precipitation, current.precipitation, eased),
    rain: interpolate(previous.rain, current.rain, eased),
    showers: interpolate(previous.showers, current.showers, eased),
    snowfall: interpolate(previous.snowfall, current.snowfall, eased),
    windSpeed: interpolate(previous.windSpeed, current.windSpeed, eased),
    windGusts: interpolate(previous.windGusts, current.windGusts, eased),
    windDirection: (previous.windDirection + directionDelta * eased + 360) % 360,
    temperature: interpolate(previous.temperature, current.temperature, eased),
  };
}

/** Deterministic, three-hour fallback with a ten-minute visual hand-over. */
export function deterministicFallbackWeather(date: Date, locationKey: string): WeatherObservation {
  const block = Math.floor(date.getHours() / 3);
  const current = fallbackForBlock(date, locationKey, block);
  const minutesIntoBlock = (date.getHours() % 3) * 60 + date.getMinutes() + date.getSeconds() / 60;
  if (minutesIntoBlock >= 10) return current;
  const previousDate = new Date(date.getTime() - Math.max(1, minutesIntoBlock) * 60_000);
  const previous = fallbackForBlock(previousDate, locationKey, block === 0 ? 7 : block - 1);
  return blendWeather(previous, current, minutesIntoBlock / 10);
}

export function observationForOverride(kind: WeatherKind, date: Date): WeatherObservation {
  const code = kind === 'clear' ? 0 : kind === 'cloudy' ? 3 : kind === 'fog' ? 45 : kind === 'rain' ? 63 : kind === 'snow' ? 73 : 96;
  return {
    kind,
    previousKind: kind,
    transitionProgress: 1,
    weatherCode: code,
    cloudCover: kind === 'clear' ? 5 : kind === 'cloudy' ? 78 : kind === 'fog' ? 96 : 88,
    precipitation: kind === 'rain' ? 3.5 : kind === 'snow' ? 0.8 : kind === 'storm' ? 7 : 0,
    rain: kind === 'rain' ? 2.8 : kind === 'storm' ? 5.5 : 0,
    showers: kind === 'rain' ? 0.7 : kind === 'storm' ? 1.5 : 0,
    snowfall: kind === 'snow' ? 1.2 : 0,
    windSpeed: kind === 'storm' ? 48 : kind === 'clear' ? 5 : 17,
    windGusts: kind === 'storm' ? 72 : kind === 'clear' ? 9 : 28,
    windDirection: 238,
    temperature: kind === 'snow' ? -3 : kind === 'clear' ? 19 : 10,
    isDay: date.getHours() >= 7 && date.getHours() < 20,
    observedAt: date,
  };
}
