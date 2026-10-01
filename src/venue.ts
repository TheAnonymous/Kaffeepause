import type { DayPhase, WeatherKind } from './environment/types';

export const VENUE_KINDS = ['cafe', 'ramen', 'arcade'] as const;

export type VenueKind = (typeof VENUE_KINDS)[number];

export interface VenueDefinition {
  readonly kind: VenueKind;
  readonly name: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly enterLabel: string;
  readonly statusMessage: string;
  readonly canvasLabel: string;
}

export const DEFAULT_VENUE: VenueKind = 'cafe';

export const VENUES: Readonly<Record<VenueKind, VenueDefinition>> = {
  cafe: {
    kind: 'cafe',
    name: 'Café',
    eyebrow: 'Ein kleiner Regentag',
    description: 'Warme Lampen, leise Tassen und ein Platz am Fenster.',
    enterLabel: 'Café betreten',
    statusMessage: 'Du bist im Café. Drinnen läuft leise Musik.',
    canvasLabel: 'Ein gemütliches, belebtes Klötzchen-Café bei wechselnder Tageszeit und Wetter',
  },
  ramen: {
    kind: 'ramen',
    name: 'Ramen-Restaurant',
    eyebrow: 'Dampf in der Abendluft',
    description: 'Rote Laternen, tiefe Brühe und ein ruhiger Platz an der Theke.',
    enterLabel: 'Ramen-Restaurant betreten',
    statusMessage: 'Du bist im Ramen-Restaurant. Dampf steigt auf, draußen zieht das Wetter vorbei.',
    canvasLabel: 'Ein warmes, belebtes Klötzchen-Ramen-Restaurant bei wechselnder Tageszeit und Wetter',
  },
  arcade: {
    kind: 'arcade',
    name: 'Arcade-Halle',
    eyebrow: 'Neon nach Feierabend',
    description: 'Gedämpfte Automaten, flackernde Bildschirme und ein stiller Winkel.',
    enterLabel: 'Arcade-Halle betreten',
    statusMessage: 'Du bist in der Arcade-Halle. Neon und leise Automatenklänge begleiten den Abend.',
    canvasLabel: 'Eine stimmungsvolle, belebte Klötzchen-Arcade-Halle bei wechselnder Tageszeit und Wetter',
  },
};

export function isVenueKind(value: string | undefined): value is VenueKind {
  return Boolean(value && VENUE_KINDS.includes(value as VenueKind));
}

const DARK_PHASES: readonly DayPhase[] = ['night', 'dusk', 'evening'];

/** Die Zeile über dem Titel; im Café passt sie zum Wetter vor dem Fenster. */
export function venueEyebrow(venue: VenueKind, weather: WeatherKind, dayPhase: DayPhase): string {
  if (venue !== 'cafe') return VENUES[venue].eyebrow;
  const dark = DARK_PHASES.includes(dayPhase);
  switch (weather) {
    case 'rain': return dark ? 'Regen an den Scheiben' : 'Ein kleiner Regentag';
    case 'storm': return 'Gewitter vor dem Fenster';
    case 'snow': return 'Schnee vor dem Fenster';
    case 'fog': return 'Nebel über der Stadt';
    case 'cloudy': return 'Ein grauer, gemütlicher Tag';
    default: return dayPhase === 'night' ? 'Eine stille Nacht' : dark || dayPhase === 'dawn' ? 'Goldenes Licht am Fenster' : 'Sonne auf den Tassen';
  }
}

const CAFE_OUTSIDE: Readonly<Record<WeatherKind, string>> = {
  rain: 'Draußen rauscht der Regen',
  storm: 'Draußen grollt ein Gewitter',
  snow: 'Draußen fällt Schnee',
  fog: 'Draußen liegt Nebel',
  cloudy: 'Draußen ist der Himmel grau',
  clear: 'Draußen ist der Himmel klar',
};

/** Ansage beim Betreten; sagt, was man draußen vor dem Café wirklich sieht. */
export function venueStatus(venue: VenueKind, weather: WeatherKind): string {
  if (venue !== 'cafe') return VENUES[venue].statusMessage;
  return `Du bist im Café. ${CAFE_OUTSIDE[weather]}, drinnen läuft leise Musik.`;
}
