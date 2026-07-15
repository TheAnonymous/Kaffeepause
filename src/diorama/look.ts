import { Color } from 'three';
import type { CafeEnvironmentSnapshot, DayPhase, WeatherKind } from '../environment/types';
import type { VenueKind } from '../venue';
import { DIORAMA_THEMES } from './types';
import { VENUE_VISUAL_PROFILES } from './visualProfiles';

export interface DioramaLook {
  readonly daylight: number;
  readonly night: number;
  readonly wetness: number;
  readonly fog: number;
  readonly precipitation: number;
  readonly exposure: number;
  readonly ambientIntensity: number;
  readonly keyIntensity: number;
  readonly practicalIntensity: number;
  readonly characterEmissive: number;
  readonly shadowLift: number;
  readonly saturation: number;
  readonly vignette: number;
  readonly lightPoolOpacity: number;
  readonly bloom: number;
  readonly focusBand: number;
  readonly blur: number;
  readonly sky: Color;
  readonly sun: Color;
  readonly ambient: Color;
  readonly shadowColor: Color;
  readonly keyColor: Color;
  readonly fillColor: Color;
  readonly practicalColor: Color;
  readonly focusColor: Color;
  readonly minimumCharacterContrast: number;
  readonly fromRight: boolean;
}

const DAYLIGHT: Readonly<Record<DayPhase, number>> = {
  night: 0.08, dawn: 0.36, morning: 0.72, midday: 1, afternoon: 0.82, dusk: 0.38, evening: 0.18,
};

const SKY: Readonly<Record<DayPhase, string>> = {
  night: '#11182b', dawn: '#7f5265', morning: '#8eb5c6', midday: '#6fa9ca',
  afternoon: '#8ca7ac', dusk: '#9f5963', evening: '#3d3853',
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function weatherWeight(kind: WeatherKind, weather: WeatherKind): number {
  return kind === weather ? 1 : 0;
}

export function calculateDioramaLook(
  venue: VenueKind,
  environment?: CafeEnvironmentSnapshot,
): DioramaLook {
  const phase = environment?.dayPhase ?? 'afternoon';
  const weather = environment?.weather.kind ?? 'clear';
  const transition = environment?.weather.transitionProgress ?? 1;
  const previous = environment?.weather.previousKind ?? weather;
  const weight = (kind: WeatherKind): number => (
    weatherWeight(kind, previous) * (1 - transition) + weatherWeight(kind, weather) * transition
  );
  const storm = weight('storm');
  const rain = weight('rain') + storm;
  const snow = weight('snow');
  const fog = clamp(weight('fog') * 0.78 + weight('cloudy') * 0.12 + storm * 0.2);
  const cloud = clamp((environment?.weather.cloudCover ?? 18) / 100);
  const daylight = clamp(DAYLIGHT[phase] * (1 - cloud * 0.28 - storm * 0.22));
  const night = 1 - daylight;
  const theme = DIORAMA_THEMES[venue];
  const profile = VENUE_VISUAL_PROFILES[venue];
  const sky = new Color(SKY[phase]).lerp(new Color('#3c4653'), clamp(cloud * 0.45 + fog * 0.35));
  const sun = new Color(phase === 'dawn' || phase === 'dusk' ? '#ffd09a' : '#fff0cf');
  const ambient = new Color(theme.wall).lerp(new Color(theme.glow), 0.22 + night * 0.18);

  return {
    daylight,
    night,
    wetness: clamp(rain * 0.9 + snow * 0.22),
    fog,
    precipitation: clamp(rain + snow * 0.7),
    exposure: 1 + daylight * 0.1 + (venue === 'arcade' ? 0.04 : 0),
    ambientIntensity: 1.05 + daylight * 0.35,
    keyIntensity: 1.15 + daylight * 3,
    practicalIntensity: 18 + night * 24,
    characterEmissive: Math.min(0.3, 0.045 + night * 0.2 + (venue === 'arcade' ? 0.035 : 0)),
    shadowLift: Math.min(profile.contrast.maximumShadowLift, profile.contrast.minimumShadowLift + night * 0.095),
    saturation: Math.min(profile.contrast.saturation[1], profile.contrast.saturation[0] + night * 0.035),
    vignette: 0.08 + night * 0.04,
    lightPoolOpacity: 0.06 + night * 0.18,
    bloom: clamp(profile.bloom.minimum + night * (venue === 'arcade' ? 0.46 : 0.34), profile.bloom.minimum, profile.bloom.maximum),
    focusBand: 0.57,
    blur: 0.0016 + fog * 0.0012,
    sky,
    sun,
    ambient,
    shadowColor: new Color(profile.shadowColor),
    keyColor: new Color(profile.lights.key),
    fillColor: new Color(profile.lights.fill),
    practicalColor: new Color(profile.lights.practical),
    focusColor: new Color(profile.lights.focus),
    minimumCharacterContrast: profile.contrast.minimumCharacterContrast,
    fromRight: (environment?.solar.azimuth ?? 220) >= 180,
  };
}
