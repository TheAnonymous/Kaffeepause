/** Kleine Deko nach Datum: Kürbisse um Halloween, Lichterketten im Dezember. */
export type Season = 'halloween' | 'winter-lights' | 'none';

const SEASONS: readonly Season[] = ['halloween', 'winter-lights', 'none'];

export function seasonForDate(date: Date): Season {
  const month = date.getMonth();
  const day = date.getDate();
  if ((month === 9 && day >= 15) || (month === 10 && day <= 1)) return 'halloween';
  if (month === 11 || (month === 0 && day <= 6)) return 'winter-lights';
  return 'none';
}

/** `?season=halloween|winter-lights|none` nur im Entwicklungsserver. */
export function parseSeasonOverride(search: string, development: boolean): Season | undefined {
  if (!development) return undefined;
  const requested = new URLSearchParams(search).get('season');
  return SEASONS.find((season) => season === requested);
}
