import type { AtmosphereSnapshot } from './atmosphere/types';
import type { CafeEnvironmentSnapshot } from './environment/types';
import type { AccidentKind, CafeMomentKind } from './simulation/types';
import type { VenueKind } from './venue';
import type { VenueSampleState } from './audioSamples';
import type { CafeAudioEngine } from './audioEngine';

export type AudioState = 'idle' | 'playing' | 'muted' | 'unavailable';
export const REACTION_ACCENT_MAX_GAIN = 0.008;

export function clampStereoPan(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function cuePlaybackRate(range: readonly [number, number], randomValue: number): number {
  const amount = Math.max(0, Math.min(1, randomValue));
  return range[0] + (range[1] - range[0]) * amount;
}

const DETAIL_INTERVALS: Readonly<Record<VenueKind, readonly [number, number]>> = {
  cafe: [10_500, 21_000], ramen: [9_000, 18_000], arcade: [9_500, 19_000],
};

export function soundDetailDelayMs(venue: VenueKind, guestCount: number, randomValue: number): number {
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const [minimum, maximum] = DETAIL_INTERVALS[venue];
  const crowd = clamp(guestCount / 8);
  const base = minimum + (maximum - minimum) * clamp(randomValue);
  return Math.round(base * (1 - crowd * 0.16));
}

type AudioModule = typeof import('./audioEngine');

/**
 * Small eager facade. The heavy synth/sample graph is prefetched during idle renderer
 * preparation, while AudioContext construction and resume stay synchronous in the entry click.
 */
export class CafeAudio {
  private modulePromise?: Promise<AudioModule>;
  private engine?: CafeAudioEngine;
  private activatedContext?: AudioContext;
  private venue: VenueKind = 'cafe';
  private muted = false;
  private unavailable = false;
  private environment?: { snapshot: CafeEnvironmentSnapshot; guests: number };
  private wave?: AtmosphereSnapshot;

  preload(): Promise<void> {
    return this.loadModule().then(() => undefined, () => undefined);
  }

  async start(): Promise<AudioState> {
    if (this.engine) return this.engine.start();
    if (typeof AudioContext === 'undefined') {
      this.unavailable = true;
      return 'unavailable';
    }
    const context = this.activatedContext ?? new AudioContext();
    this.activatedContext = context;
    void context.resume().catch(() => undefined);
    try {
      const module = await this.loadModule();
      const engine = new module.CafeAudioEngine();
      this.engine = engine;
      engine.setVenue(this.venue);
      if (this.environment) engine.setAtmosphere(this.environment.snapshot, this.environment.guests);
      if (this.wave) engine.setAtmosphereWave(this.wave);
      engine.setMuted(this.muted);
      const state = await engine.start(context);
      this.activatedContext = undefined;
      return state;
    } catch {
      if (context.state !== 'closed') await context.close();
      this.activatedContext = undefined;
      this.unavailable = true;
      return 'unavailable';
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.engine?.setMuted(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  fadeForVisibility(hidden: boolean): void { this.engine?.fadeForVisibility(hidden); }

  setAtmosphere(snapshot: CafeEnvironmentSnapshot, guestCount: number): void {
    this.environment = { snapshot, guests: guestCount };
    this.engine?.setAtmosphere(snapshot, guestCount);
  }

  setAtmosphereWave(snapshot: AtmosphereSnapshot): void {
    this.wave = snapshot;
    this.engine?.setAtmosphereWave(snapshot);
  }

  setVenue(venue: VenueKind): void {
    this.venue = venue;
    this.engine?.setVenue(venue);
  }

  playAccident(kind: AccidentKind): void { this.engine?.playAccident(kind); }
  playMoment(kind: CafeMomentKind): void { this.engine?.playMoment(kind); }
  playReaction(): boolean { return this.engine?.playReaction() ?? false; }
  getState(): AudioState { return this.unavailable ? 'unavailable' : this.engine?.getState() ?? 'idle'; }
  getSampleState(): VenueSampleState { return this.engine?.getSampleState() ?? 'idle'; }
  getLayerSummary(): string {
    if (this.engine) return this.engine.getLayerSummary();
    const voice = this.venue === 'cafe' ? 'electric-piano' : this.venue === 'ramen' ? 'wood-ceramic' : 'fm-chip';
    return `exterior-glass|room-${this.venue}|music-${voice}|procedural|wave-${this.wave?.wave ?? 'none'}`;
  }

  async destroy(): Promise<void> {
    if (this.engine) await this.engine.destroy();
    else if (this.activatedContext && this.activatedContext.state !== 'closed') await this.activatedContext.close();
    this.engine = undefined;
    this.activatedContext = undefined;
  }

  private loadModule(): Promise<AudioModule> {
    this.modulePromise ??= import('./audioEngine');
    return this.modulePromise;
  }
}
