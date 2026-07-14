import type { Coordinates, DayPhase, SolarState } from './types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/**
 * Solar position following the compact NOAA/Meeus equations. The calculation
 * consumes an absolute instant, so browser daylight-saving offsets are already
 * represented by the Date passed by the caller.
 */
export function calculateSolarState(date: Date, coordinates: Coordinates): SolarState {
  const century = (julianDay(date) - 2_451_545) / 36_525;
  const geometricMeanLongitude = normalizeDegrees(280.46646 + century * (36_000.76983 + century * 0.0003032));
  const geometricMeanAnomaly = 357.52911 + century * (35_999.05029 - 0.0001537 * century);
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
  const anomalyRadians = geometricMeanAnomaly * DEG_TO_RAD;
  const equationOfCenter = Math.sin(anomalyRadians) * (1.914602 - century * (0.004817 + 0.000014 * century))
    + Math.sin(2 * anomalyRadians) * (0.019993 - 0.000101 * century)
    + Math.sin(3 * anomalyRadians) * 0.000289;
  const trueLongitude = geometricMeanLongitude + equationOfCenter;
  const omega = 125.04 - 1934.136 * century;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  const correctedObliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  const declination = Math.asin(
    Math.sin(correctedObliquity * DEG_TO_RAD) * Math.sin(apparentLongitude * DEG_TO_RAD),
  );

  const y = Math.tan((correctedObliquity * DEG_TO_RAD) / 2) ** 2;
  const longitudeRadians = geometricMeanLongitude * DEG_TO_RAD;
  const equationOfTime = 4 * RAD_TO_DEG * (
    y * Math.sin(2 * longitudeRadians)
      - 2 * eccentricity * Math.sin(anomalyRadians)
      + 4 * eccentricity * y * Math.sin(anomalyRadians) * Math.cos(2 * longitudeRadians)
      - 0.5 * y * y * Math.sin(4 * longitudeRadians)
      - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomalyRadians)
  );

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarMinutes = ((utcMinutes + equationOfTime + coordinates.longitude * 4) % 1440 + 1440) % 1440;
  const hourAngleDegrees = trueSolarMinutes / 4 - 180;
  const hourAngle = hourAngleDegrees * DEG_TO_RAD;
  const latitude = coordinates.latitude * DEG_TO_RAD;
  const cosineZenith = clamp(
    Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    -1,
    1,
  );
  const zenith = Math.acos(cosineZenith);
  const elevation = 90 - zenith * RAD_TO_DEG;
  const azimuth = normalizeDegrees(Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  ) * RAD_TO_DEG + 180);

  const sunriseCosine = (
    Math.cos(90.833 * DEG_TO_RAD) / (Math.cos(latitude) * Math.cos(declination))
      - Math.tan(latitude) * Math.tan(declination)
  );
  const polarState = sunriseCosine < -1 ? 'polar-day' : sunriseCosine > 1 ? 'polar-night' : 'normal';

  return {
    elevation,
    azimuth,
    isDay: elevation >= -0.833,
    isCivilTwilight: elevation >= -6 && elevation < -0.833,
    polarState,
  };
}

/** A location-free curve which remains useful when geolocation is unavailable. */
export function calculateDefaultSolarState(date: Date): SolarState {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const seasonal = Math.cos(((dayOfYear - 172) / 365.2422) * Math.PI * 2);
  const sunrise = 7.25 - seasonal * 1.35;
  const sunset = 18.75 + seasonal * 1.55;
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const daylightProgress = (hours - sunrise) / (sunset - sunrise);
  const elevation = Math.sin(daylightProgress * Math.PI) * 55;
  const belowHorizon = hours < sunrise ? (hours - sunrise) * 9 : (sunset - hours) * 9;
  const finalElevation = hours >= sunrise && hours <= sunset ? elevation : Math.max(-25, belowHorizon);
  return {
    elevation: finalElevation,
    azimuth: normalizeDegrees(90 + daylightProgress * 180),
    isDay: finalElevation >= -0.833,
    isCivilTwilight: finalElevation >= -6 && finalElevation < -0.833,
    polarState: 'normal',
  };
}

export function dayPhaseFor(date: Date, solar: SolarState): DayPhase {
  const hours = date.getHours() + date.getMinutes() / 60;
  const beforeNoon = solar.azimuth < 180;
  if (solar.polarState === 'polar-night' && solar.elevation < -6) return 'night';
  if (solar.polarState === 'polar-day' && (hours >= 22 || hours < 5)) return 'evening';
  if (solar.elevation < -6) return hours >= 20 || hours < 5 ? 'night' : beforeNoon ? 'dawn' : 'dusk';
  if (solar.elevation < 3) return beforeNoon ? 'dawn' : 'dusk';
  if (hours < 10.5) return 'morning';
  if (hours < 14) return 'midday';
  if (hours < 18) return 'afternoon';
  return solar.isDay ? 'evening' : 'night';
}
