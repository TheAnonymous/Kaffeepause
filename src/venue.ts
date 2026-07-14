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
    statusMessage: 'Du bist im Café. Regen und leise Musik erfüllen den Raum.',
    canvasLabel: 'Ein gemütliches, belebtes Pixel-Art-Café bei wechselnder Tageszeit und Wetter',
  },
  ramen: {
    kind: 'ramen',
    name: 'Ramen-Restaurant',
    eyebrow: 'Dampf in der Abendluft',
    description: 'Rote Laternen, tiefe Brühe und ein ruhiger Platz an der Theke.',
    enterLabel: 'Ramen-Restaurant betreten',
    statusMessage: 'Du bist im Ramen-Restaurant. Dampf steigt auf, draußen zieht das Wetter vorbei.',
    canvasLabel: 'Ein warmes, belebtes Pixel-Art-Ramen-Restaurant bei wechselnder Tageszeit und Wetter',
  },
  arcade: {
    kind: 'arcade',
    name: 'Arcade-Halle',
    eyebrow: 'Neon nach Feierabend',
    description: 'Gedämpfte Automaten, flackernde Bildschirme und ein stiller Winkel.',
    enterLabel: 'Arcade-Halle betreten',
    statusMessage: 'Du bist in der Arcade-Halle. Neon und leise Automatenklänge begleiten den Abend.',
    canvasLabel: 'Eine stimmungsvolle, belebte Pixel-Art-Arcade-Halle bei wechselnder Tageszeit und Wetter',
  },
};

export function isVenueKind(value: string | undefined): value is VenueKind {
  return Boolean(value && VENUE_KINDS.includes(value as VenueKind));
}
