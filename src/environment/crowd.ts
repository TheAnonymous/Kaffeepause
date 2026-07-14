import type { WeatherObservation } from './types';

const CROWD_ANCHORS: readonly [minute: number, guests: number][] = [
  [0, 0],
  [330, 0],
  [390, 1],
  [450, 5],
  [510, 8],
  [630, 4],
  [690, 6],
  [750, 8],
  [840, 5],
  [990, 3],
  [1110, 4],
  [1230, 2],
  [1320, 1],
  [1440, 0],
];

export function baseCrowdTarget(minuteOfDay: number): number {
  const minute = Math.min(1440, Math.max(0, minuteOfDay));
  for (let index = 1; index < CROWD_ANCHORS.length; index += 1) {
    const right = CROWD_ANCHORS[index];
    const left = CROWD_ANCHORS[index - 1];
    if (!left || !right || minute > right[0]) continue;
    const progress = (minute - left[0]) / Math.max(1, right[0] - left[0]);
    return left[1] + (right[1] - left[1]) * progress;
  }
  return 0;
}

export function correctedCrowdTarget(
  minuteOfDay: number,
  weather: WeatherObservation,
  previousTarget?: number,
): number {
  let target = baseCrowdTarget(minuteOfDay);
  const daytime = minuteOfDay >= 360 && minuteOfDay < 1260;
  const lateOrEarly = minuteOfDay >= 1080 || minuteOfDay < 360;
  if (daytime && (weather.kind === 'rain' || weather.kind === 'snow')) target += 1;
  if (lateOrEarly && (weather.kind === 'storm' || weather.windGusts >= 50)) target -= 1;
  const cap = minuteOfDay >= 1320 || minuteOfDay < 360 ? 1 : 8;
  const bounded = Math.max(0, Math.min(cap, target));
  if (previousTarget === undefined) return Math.round(bounded);
  let rounded = Math.max(0, Math.min(cap, previousTarget));
  while (bounded >= rounded + 0.6 && rounded < cap) rounded += 1;
  while (bounded <= rounded - 0.6 && rounded > 0) rounded -= 1;
  return rounded;
}
