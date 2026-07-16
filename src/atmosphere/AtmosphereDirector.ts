import type { CafeEnvironmentSnapshot } from '../environment/types';
import { SeededRandom } from '../simulation/random';
import type { VenueKind } from '../venue';
import {
  VENUE_ATMOSPHERE_PROFILES,
  atmosphereZone,
  type AtmosphereDevelopmentOverrides,
  type AtmosphereObservation,
  type AtmosphereSnapshot,
  type AtmosphereWaveKind,
} from './types';

export interface AtmosphereDirectorOptions {
  readonly seed?: number;
  readonly firstIntervalSeconds?: readonly [number, number];
  readonly laterIntervalSeconds?: readonly [number, number];
  readonly durationSeconds?: readonly [number, number];
  readonly conflictGuardSeconds?: number;
  readonly conflictFadeSeconds?: number;
  readonly overrides?: AtmosphereDevelopmentOverrides;
}

interface ActiveWave {
  readonly kind: AtmosphereWaveKind;
  readonly seed: number;
  readonly startedAt: number;
  readonly duration: number;
  readonly venueSignature: boolean;
  conflictFadeAt?: number;
  conflictFadeIntensity?: number;
}

const DEFAULT_SEED = 0xa705_2026;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function venueSignatureWave(venue: VenueKind): AtmosphereWaveKind {
  return VENUE_ATMOSPHERE_PROFILES[venue].signature;
}

export function eligibleAtmosphereWaves(
  environment: CafeEnvironmentSnapshot,
  venue: VenueKind,
): readonly AtmosphereWaveKind[] {
  const { weather, dayPhase, solar } = environment;
  const result: AtmosphereWaveKind[] = ['pedestrian-poetry', venueSignatureWave(venue)];
  const dark = dayPhase === 'night' || dayPhase === 'evening' || dayPhase === 'dusk' || !solar.isDay;
  if (dark || weather.precipitation > 0.1) result.push('traffic-glow');
  if (weather.kind === 'rain' || weather.kind === 'storm' || weather.rain + weather.showers > 0.1) result.push('rain-surge');
  if (weather.windSpeed >= 10 || weather.windGusts >= 20) result.push('wind-gust');
  if (weather.kind === 'storm') result.push('distant-thunder');
  if (weather.kind === 'snow' || weather.snowfall > 0) result.push('snow-quiet');
  if (weather.kind === 'fog' || weather.cloudCover >= 82) result.push('fog-glow');
  if ((weather.kind === 'clear' || weather.kind === 'cloudy') && solar.elevation > 3) result.push('sunbreak');
  return [...new Set(result)];
}

export class AtmosphereDirector {
  private random: SeededRandom;
  private readonly baseSeed: number;
  private readonly firstInterval: readonly [number, number];
  private readonly laterInterval: readonly [number, number];
  private readonly durationRange: readonly [number, number];
  private readonly conflictGuard: number;
  private readonly conflictFade: number;
  private readonly overrides: AtmosphereDevelopmentOverrides;
  private clock = 0;
  private nextStart = 0;
  private guardUntil = 0;
  private active?: ActiveWave;
  private currentVenue?: VenueKind;
  private lastKind?: AtmosphereWaveKind;
  private wavesSinceVenueSignature = 0;
  private waveSerial = 0;
  private conflictActive = false;

  constructor(options: AtmosphereDirectorOptions = {}) {
    this.baseSeed = (options.seed ?? DEFAULT_SEED) >>> 0;
    this.random = new SeededRandom(this.baseSeed);
    this.firstInterval = options.firstIntervalSeconds ?? [35, 55];
    this.laterInterval = options.laterIntervalSeconds ?? [90, 150];
    this.durationRange = options.durationSeconds ?? [8, 20];
    this.conflictGuard = Math.max(0, options.conflictGuardSeconds ?? 12);
    this.conflictFade = Math.max(0.05, options.conflictFadeSeconds ?? 0.8);
    this.overrides = options.overrides ?? { scale: 1 };
    this.nextStart = this.scaledRange(this.firstInterval);
  }

  observe(observation: AtmosphereObservation): AtmosphereSnapshot {
    if (this.currentVenue !== observation.venue) this.resetForVenue(observation.venue);
    if (!observation.visible) return this.snapshot(observation);

    const delta = Math.max(0, Number.isFinite(observation.deltaSeconds) ? observation.deltaSeconds : 0);
    this.clock += delta;

    if (this.overrides.wave) return this.forcedSnapshot(observation);

    const conflict = Boolean(observation.scene.moment || observation.scene.accident);
    if (conflict) {
      this.guardUntil = Math.max(this.guardUntil, this.clock + this.conflictGuard * this.overrides.scale);
      this.nextStart = Math.max(this.nextStart, this.guardUntil);
      if (this.active && this.active.conflictFadeAt === undefined) {
        this.active.conflictFadeIntensity = this.regularIntensity(this.active, this.clock);
        this.active.conflictFadeAt = this.clock;
      }
    } else if (this.conflictActive) {
      this.guardUntil = Math.max(this.guardUntil, this.clock + this.conflictGuard * this.overrides.scale);
      this.nextStart = Math.max(this.nextStart, this.guardUntil);
    }
    this.conflictActive = conflict;

    if (this.active && this.waveFinished(this.active)) {
      const endedAt = this.active.conflictFadeAt === undefined
        ? this.active.startedAt + this.active.duration
        : this.active.conflictFadeAt + this.conflictFade;
      this.active = undefined;
      this.nextStart = Math.max(this.guardUntil, endedAt + this.scaledRange(this.laterInterval));
    }

    if (!this.active && !conflict && this.clock >= Math.max(this.nextStart, this.guardUntil)) this.beginWave(observation);
    return this.snapshot(observation);
  }

  private resetForVenue(venue: VenueKind): void {
    this.currentVenue = venue;
    this.active = undefined;
    this.lastKind = undefined;
    this.wavesSinceVenueSignature = 0;
    this.waveSerial = 0;
    this.conflictActive = false;
    this.guardUntil = this.clock;
    const venueSalt = venue === 'cafe' ? 0xca_fe : venue === 'ramen' ? 0x7a_3e : 0xa7_ca;
    this.random = new SeededRandom((this.baseSeed ^ venueSalt) >>> 0);
    this.nextStart = this.clock + this.scaledRange(this.firstInterval);
  }

  private beginWave(observation: AtmosphereObservation): void {
    const candidates = eligibleAtmosphereWaves(observation.environment, observation.venue)
      .filter((kind) => kind !== this.lastKind);
    const signature = venueSignatureWave(observation.venue);
    const forceSignature = this.wavesSinceVenueSignature >= 2;
    const kind = forceSignature ? signature : this.random.pick(candidates.length > 0 ? candidates : [signature]);
    const venueSignature = kind === signature;
    const seed = (this.baseSeed ^ (++this.waveSerial * 0x9e37_79b9) ^ Math.floor(this.clock * 1000)) >>> 0;
    this.active = {
      kind,
      seed,
      startedAt: this.clock,
      duration: this.scaledRange(this.durationRange),
      venueSignature,
    };
    this.lastKind = kind;
    this.wavesSinceVenueSignature = venueSignature ? 0 : this.wavesSinceVenueSignature + 1;
  }

  private waveFinished(wave: ActiveWave): boolean {
    if (wave.conflictFadeAt !== undefined) return this.clock >= wave.conflictFadeAt + this.conflictFade;
    return this.clock >= wave.startedAt + wave.duration;
  }

  private regularIntensity(wave: ActiveWave, at: number): number {
    const elapsed = clamp(at - wave.startedAt, 0, wave.duration);
    const fadeIn = Math.min(2.4 * this.overrides.scale, wave.duration * 0.24);
    const fadeOut = Math.min(2.8 * this.overrides.scale, wave.duration * 0.26);
    if (elapsed < fadeIn) return clamp(elapsed / Math.max(0.01, fadeIn));
    if (elapsed > wave.duration - fadeOut) return clamp((wave.duration - elapsed) / Math.max(0.01, fadeOut));
    return 1;
  }

  private snapshot(observation: AtmosphereObservation): AtmosphereSnapshot {
    const wave = this.active;
    if (!wave) {
      const idle: AtmosphereSnapshot = {
        wave: 'none', phase: 'idle', zone: 'none', intensity: 0, seed: this.baseSeed,
        venue: observation.venue, durationSeconds: 0, elapsedSeconds: 0,
        reducedMotion: observation.reducedMotion,
        motion: observation.reducedMotion ? 'crossfade' : 'animated', venueSignature: false,
      };
      return idle;
    }
    const elapsed = Math.max(0, this.clock - wave.startedAt);
    const regularIntensity = this.regularIntensity(wave, this.clock);
    const conflictProgress = wave.conflictFadeAt === undefined ? 0 : clamp((this.clock - wave.conflictFadeAt) / this.conflictFade);
    const intensity = wave.conflictFadeAt === undefined
      ? regularIntensity
      : (wave.conflictFadeIntensity ?? regularIntensity) * (1 - conflictProgress);
    const regularProgress = elapsed / Math.max(0.01, wave.duration);
    const phase = wave.conflictFadeAt !== undefined || regularProgress >= 0.78
      ? 'fade-out'
      : regularProgress <= 0.2 ? 'fade-in' : 'hold';
    const snapshot: AtmosphereSnapshot = {
      wave: wave.kind,
      phase,
      zone: atmosphereZone(wave.kind, observation.venue),
      intensity: clamp(intensity),
      seed: wave.seed,
      venue: observation.venue,
      durationSeconds: wave.duration,
      elapsedSeconds: elapsed,
      reducedMotion: observation.reducedMotion,
      motion: observation.reducedMotion ? 'crossfade' : 'animated',
      venueSignature: wave.venueSignature,
    };
    return snapshot;
  }

  private forcedSnapshot(observation: AtmosphereObservation): AtmosphereSnapshot {
    const kind = this.overrides.wave!;
    const phase = this.overrides.phase ?? 'hold';
    const intensity = phase === 'fade-in' ? 0.62 : phase === 'fade-out' ? 0.46 : 1;
    const snapshot: AtmosphereSnapshot = {
      wave: kind,
      phase,
      zone: atmosphereZone(kind, observation.venue),
      intensity,
      seed: this.baseSeed,
      venue: observation.venue,
      durationSeconds: 12,
      elapsedSeconds: phase === 'fade-in' ? 1 : phase === 'fade-out' ? 11 : 6,
      reducedMotion: observation.reducedMotion,
      motion: observation.reducedMotion ? 'crossfade' : 'animated',
      venueSignature: kind === venueSignatureWave(observation.venue),
    };
    return snapshot;
  }

  private scaledRange(range: readonly [number, number]): number {
    return this.random.range(range[0], range[1]) * this.overrides.scale;
  }
}
