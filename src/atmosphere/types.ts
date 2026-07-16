import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { SceneSnapshot } from '../scene/types';
import type { VenueKind } from '../venue';

export const ATMOSPHERE_WAVE_KINDS = [
  'pedestrian-poetry',
  'traffic-glow',
  'rain-surge',
  'wind-gust',
  'distant-thunder',
  'snow-quiet',
  'fog-glow',
  'sunbreak',
  'cafe-espresso-cycle',
  'ramen-broth-breath',
  'arcade-machine-chorus',
] as const;

export type AtmosphereWaveKind = (typeof ATMOSPHERE_WAVE_KINDS)[number];
export type AtmosphereWavePhase = 'idle' | 'fade-in' | 'hold' | 'fade-out';
export type AtmosphereZone = 'none' | 'exterior' | 'window' | 'room' | 'machine';
export type AtmosphereAssetState = 'procedural' | 'loading' | 'ready' | 'partial' | 'failed';

export interface VenueAtmosphereProfile {
  readonly venue: VenueKind;
  readonly signature: AtmosphereWaveKind;
  readonly signatureZone: Exclude<AtmosphereZone, 'none'>;
  readonly musicVoice: 'electric-piano' | 'wood-ceramic' | 'fm-chip';
  readonly accentColor: string;
  readonly exteriorColor: string;
}

export interface AtmosphereObservation {
  readonly environment: CafeEnvironmentSnapshot;
  readonly venue: VenueKind;
  /** The director observes this immutable public shape but never mutates or replaces it. */
  readonly scene: Readonly<SceneSnapshot>;
  readonly deltaSeconds: number;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
}

export interface AtmosphereSnapshot {
  readonly wave: AtmosphereWaveKind | 'none';
  readonly phase: AtmosphereWavePhase;
  readonly zone: AtmosphereZone;
  readonly intensity: number;
  readonly seed: number;
  readonly venue: VenueKind;
  readonly durationSeconds: number;
  readonly elapsedSeconds: number;
  readonly reducedMotion: boolean;
  readonly motion: 'animated' | 'crossfade';
  readonly venueSignature: boolean;
}

export interface AtmosphereDevelopmentOverrides {
  readonly wave?: AtmosphereWaveKind;
  readonly phase?: Exclude<AtmosphereWavePhase, 'idle'>;
  readonly scale: number;
}

export const VENUE_ATMOSPHERE_PROFILES: Readonly<Record<VenueKind, VenueAtmosphereProfile>> = Object.freeze({
  cafe: Object.freeze({
    venue: 'cafe', signature: 'cafe-espresso-cycle', signatureZone: 'machine',
    musicVoice: 'electric-piano', accentColor: '#ffd08a', exteriorColor: '#7795aa',
  }),
  ramen: Object.freeze({
    venue: 'ramen', signature: 'ramen-broth-breath', signatureZone: 'room',
    musicVoice: 'wood-ceramic', accentColor: '#f0a25d', exteriorColor: '#6f8a9b',
  }),
  arcade: Object.freeze({
    venue: 'arcade', signature: 'arcade-machine-chorus', signatureZone: 'machine',
    musicVoice: 'fm-chip', accentColor: '#65e7eb', exteriorColor: '#526f9d',
  }),
});

export function isAtmosphereWaveKind(value: string | null | undefined): value is AtmosphereWaveKind {
  return Boolean(value && ATMOSPHERE_WAVE_KINDS.includes(value as AtmosphereWaveKind));
}

export function atmosphereZone(kind: AtmosphereWaveKind, venue: VenueKind): Exclude<AtmosphereZone, 'none'> {
  if (kind === VENUE_ATMOSPHERE_PROFILES[venue].signature) return VENUE_ATMOSPHERE_PROFILES[venue].signatureZone;
  if (kind === 'pedestrian-poetry' || kind === 'traffic-glow' || kind === 'snow-quiet') return 'exterior';
  if (kind === 'rain-surge' || kind === 'fog-glow' || kind === 'sunbreak') return 'window';
  return 'room';
}

export function parseAtmosphereDevelopmentOverrides(
  search: string,
  enabled: boolean,
): AtmosphereDevelopmentOverrides {
  if (!enabled) return { scale: 1 };
  const parameters = new URLSearchParams(search);
  const requestedWave = parameters.get('atmosphere');
  const requestedPhase = parameters.get('atmospherePhase');
  const rawScale = Number(parameters.get('atmosphereScale') ?? 1);
  const scale = Number.isFinite(rawScale) ? Math.max(0.01, Math.min(20, rawScale)) : 1;
  return {
    ...(isAtmosphereWaveKind(requestedWave) ? { wave: requestedWave } : {}),
    ...(requestedPhase === 'fade-in' || requestedPhase === 'hold' || requestedPhase === 'fade-out'
      ? { phase: requestedPhase }
      : {}),
    scale,
  };
}
