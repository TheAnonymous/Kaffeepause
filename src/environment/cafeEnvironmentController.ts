import { correctedCrowdTarget } from './crowd';
import { calculateDefaultSolarState, calculateSolarState, dayPhaseFor } from './solar';
import type {
  CafeEnvironmentSnapshot,
  Coordinates,
  EnvironmentOverrides,
  LocationState,
  WeatherObservation,
  WeatherSource,
} from './types';
import {
  blendWeather,
  deterministicFallbackWeather,
  fetchOpenMeteo,
  observationForOverride,
} from './weather';

const WEATHER_REFRESH_MS = 15 * 60_000;
const LIVE_TRANSITION_MS = 20_000;

type EnvironmentListener = (snapshot: CafeEnvironmentSnapshot) => void;

export interface CafeEnvironmentControllerOptions {
  readonly now?: () => Date;
  readonly fetcher?: typeof fetch;
  readonly geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  readonly overrides?: EnvironmentOverrides;
  readonly onNotice?: (message: string) => void;
}

function validCoordinates(coordinates: Coordinates): boolean {
  return Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude >= -90
    && coordinates.latitude <= 90
    && coordinates.longitude >= -180
    && coordinates.longitude <= 180;
}

function roundedCoordinates(coordinates: Coordinates): Coordinates {
  return {
    latitude: Math.round(coordinates.latitude * 100) / 100,
    longitude: Math.round(coordinates.longitude * 100) / 100,
  };
}

export function parseEnvironmentOverrides(search: string, enabled: boolean): EnvironmentOverrides {
  if (!enabled) return {};
  const parameters = new URLSearchParams(search);
  const timeValue = parameters.get('time');
  const timeMatch = timeValue?.match(/^(\d{2}):(\d{2})$/);
  const hours = timeMatch ? Number(timeMatch[1]) : Number.NaN;
  const minutes = timeMatch ? Number(timeMatch[2]) : Number.NaN;
  const weatherValue = parameters.get('weather');
  const weatherKinds = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
  const latitude = Number(parameters.get('lat'));
  const longitude = Number(parameters.get('lon'));
  const coordinates = parameters.has('lat') && parameters.has('lon')
    ? { latitude, longitude }
    : undefined;
  return {
    time: hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? { hours, minutes } : undefined,
    weather: weatherKinds.includes(weatherValue as typeof weatherKinds[number])
      ? weatherValue as typeof weatherKinds[number]
      : undefined,
    coordinates: coordinates && validCoordinates(coordinates) ? roundedCoordinates(coordinates) : undefined,
  };
}

export class CafeEnvironmentController {
  private readonly now: () => Date;
  private readonly fetcher?: typeof fetch;
  private readonly geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  private readonly overrides: EnvironmentOverrides;
  private readonly onNotice?: (message: string) => void;
  private readonly listeners = new Set<EnvironmentListener>();
  private readonly notices = new Set<string>();
  private coordinates?: Coordinates;
  private locationState: LocationState = 'pending';
  private liveWeather?: WeatherObservation;
  private transitionFrom?: WeatherObservation;
  private transitionStartedAt = 0;
  private snapshot: CafeEnvironmentSnapshot;
  private minuteTimer?: ReturnType<typeof globalThis.setInterval>;
  private weatherTimer?: ReturnType<typeof globalThis.setInterval>;
  private hiddenAt?: number;
  private started = false;
  private crowdTarget?: number;

  constructor(options: CafeEnvironmentControllerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.geolocation = options.geolocation
      ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);
    this.overrides = options.overrides ?? {};
    this.onNotice = options.onNotice;
    if (this.overrides.coordinates) {
      this.coordinates = roundedCoordinates(this.overrides.coordinates);
      this.locationState = 'override';
    }
    this.snapshot = this.createSnapshot();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.update();
    this.minuteTimer = globalThis.setInterval(() => this.publish(), 60_000);
    this.weatherTimer = globalThis.setInterval(() => void this.refreshWeather(), WEATHER_REFRESH_MS);

    if (this.overrides.coordinates) {
      if (!this.overrides.weather) void this.refreshWeather();
      return;
    }
    if (!this.geolocation) {
      this.locationState = 'unavailable';
      this.noticeOnce('location', 'Standort ist nicht verfügbar. Das Café verwendet eine lokale Ersatzumgebung.');
      this.publish();
      return;
    }
    this.geolocation.getCurrentPosition(
      (position) => {
        const candidate = roundedCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (!validCoordinates(candidate)) {
          this.locationState = 'unavailable';
          this.noticeOnce('location', 'Der Standort war ungültig. Das Café verwendet eine lokale Ersatzumgebung.');
          this.publish();
          return;
        }
        this.coordinates = candidate;
        this.locationState = 'granted';
        this.publish();
        if (!this.overrides.weather) void this.refreshWeather();
      },
      (error) => {
        this.locationState = error.code === 1 ? 'denied' : 'unavailable';
        this.noticeOnce('location', 'Ohne Standort läuft das Café mit einer lokalen Ersatzumgebung weiter.');
        this.publish();
      },
      { enableHighAccuracy: false, maximumAge: 1_800_000, timeout: 8_000 },
    );
  }

  stop(): void {
    if (this.minuteTimer !== undefined) globalThis.clearInterval(this.minuteTimer);
    if (this.weatherTimer !== undefined) globalThis.clearInterval(this.weatherTimer);
    this.minuteTimer = undefined;
    this.weatherTimer = undefined;
    this.started = false;
  }

  subscribe(listener: EnvironmentListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): CafeEnvironmentSnapshot {
    return this.snapshot;
  }

  /** Recomputes smooth transitions; inexpensive enough to call from animation frames. */
  update(): CafeEnvironmentSnapshot {
    this.snapshot = this.createSnapshot();
    return this.snapshot;
  }

  async refreshWeather(): Promise<void> {
    if (!this.coordinates || !this.fetcher || this.overrides.weather) return;
    try {
      const receivedAt = this.currentDate();
      const observation = await fetchOpenMeteo(this.fetcher, this.coordinates, receivedAt);
      this.transitionFrom = this.createWeather(receivedAt);
      this.liveWeather = observation;
      this.transitionStartedAt = this.now().getTime();
      this.publish();
    } catch {
      // A prior valid live observation intentionally remains authoritative.
      if (!this.liveWeather) {
        this.noticeOnce('weather', 'Live-Wetter ist gerade nicht erreichbar. Die Ersatzumgebung bleibt aktiv.');
      }
      this.publish();
    }
  }

  visibilityChanged(hidden: boolean): void {
    const now = this.now().getTime();
    if (hidden) {
      this.hiddenAt = now;
      return;
    }
    if (this.hiddenAt !== undefined && now - this.hiddenAt >= WEATHER_REFRESH_MS) void this.refreshWeather();
    this.hiddenAt = undefined;
    this.publish();
  }

  private publish(): void {
    this.update();
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private currentDate(): Date {
    const date = new Date(this.now().getTime());
    if (this.overrides.time) {
      date.setHours(this.overrides.time.hours, this.overrides.time.minutes, 0, 0);
    }
    return date;
  }

  private createSnapshot(): CafeEnvironmentSnapshot {
    const localTime = this.currentDate();
    const solar = this.coordinates
      ? calculateSolarState(localTime, this.coordinates)
      : calculateDefaultSolarState(localTime);
    const weather = this.createWeather(localTime);
    const minuteOfDay = localTime.getHours() * 60 + localTime.getMinutes() + localTime.getSeconds() / 60;
    this.crowdTarget = correctedCrowdTarget(minuteOfDay, weather, this.crowdTarget);
    return {
      localTime,
      localTimeText: `${String(localTime.getHours()).padStart(2, '0')}:${String(localTime.getMinutes()).padStart(2, '0')}`,
      minuteOfDay,
      dayPhase: dayPhaseFor(localTime, solar),
      solar,
      weather,
      weatherSource: this.weatherSource(),
      locationState: this.locationState,
      targetCrowd: this.crowdTarget,
      coordinates: this.coordinates,
    };
  }

  private createWeather(date: Date): WeatherObservation {
    if (this.overrides.weather) return observationForOverride(this.overrides.weather, date);
    if (this.liveWeather) {
      const elapsed = this.now().getTime() - this.transitionStartedAt;
      if (this.transitionFrom && elapsed < LIVE_TRANSITION_MS) {
        return blendWeather(this.transitionFrom, this.liveWeather, elapsed / LIVE_TRANSITION_MS);
      }
      return this.liveWeather;
    }
    const locationKey = this.coordinates
      ? `${Math.round(this.coordinates.latitude / 5) * 5},${Math.round(this.coordinates.longitude / 5) * 5}`
      : Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${-date.getTimezoneOffset() / 60}`;
    return deterministicFallbackWeather(date, locationKey);
  }

  private weatherSource(): WeatherSource {
    if (this.overrides.weather) return 'override';
    return this.liveWeather ? 'live' : 'fallback';
  }

  private noticeOnce(key: string, message: string): void {
    if (this.notices.has(key)) return;
    this.notices.add(key);
    this.onNotice?.(message);
  }
}
