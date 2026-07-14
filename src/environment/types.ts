export type DayPhase = 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening';

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export type WeatherSource = 'fallback' | 'live' | 'override';

export type LocationState = 'pending' | 'granted' | 'denied' | 'unavailable' | 'override';

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface SolarState {
  /** Degrees above the astronomical horizon. */
  readonly elevation: number;
  /** Clockwise degrees from north. */
  readonly azimuth: number;
  readonly isDay: boolean;
  readonly isCivilTwilight: boolean;
  readonly polarState: 'normal' | 'polar-day' | 'polar-night';
}

export interface WeatherObservation {
  readonly kind: WeatherKind;
  readonly previousKind: WeatherKind;
  /** 0 is the previous condition, 1 is the current condition. */
  readonly transitionProgress: number;
  readonly weatherCode: number;
  readonly cloudCover: number;
  readonly precipitation: number;
  readonly rain: number;
  readonly showers: number;
  readonly snowfall: number;
  readonly windSpeed: number;
  readonly windGusts: number;
  readonly windDirection: number;
  readonly temperature: number;
  readonly isDay: boolean;
  readonly observedAt: Date;
}

export interface CafeEnvironmentSnapshot {
  readonly localTime: Date;
  readonly localTimeText: string;
  readonly minuteOfDay: number;
  readonly dayPhase: DayPhase;
  readonly solar: SolarState;
  readonly weather: WeatherObservation;
  readonly weatherSource: WeatherSource;
  readonly locationState: LocationState;
  readonly targetCrowd: number;
  readonly coordinates?: Coordinates;
}

export interface EnvironmentOverrides {
  readonly time?: { readonly hours: number; readonly minutes: number };
  readonly weather?: WeatherKind;
  readonly coordinates?: Coordinates;
}
