import { SeededRandom } from './simulation/random';
import type { AccidentKind, CafeMomentKind } from './simulation/types';
import type { CafeEnvironmentSnapshot } from './environment/types';
import type { VenueKind } from './venue';
import { loadVenueSamplePack, samplesForVenue, type VenueSampleState } from './audioSamples';
import { momentDefinition, type MomentFoleyCue } from './simulation/momentRegistry';
import { VENUE_ATMOSPHERE_PROFILES, type AtmosphereSnapshot } from './atmosphere/types';

export type AudioState = 'idle' | 'playing' | 'muted' | 'unavailable';
export const REACTION_ACCENT_MAX_GAIN = 0.008;

export function clampStereoPan(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function cuePlaybackRate(range: readonly [number, number], randomValue: number): number {
  const amount = Math.max(0, Math.min(1, randomValue));
  return range[0] + (range[1] - range[0]) * amount;
}

const CHORDS = [
  [0, 3, 7, 10],
  [5, 9, 12, 16],
  [10, 14, 17, 21],
  [3, 7, 10, 14],
] as const;

const DETAIL_INTERVALS: Readonly<Record<VenueKind, readonly [number, number]>> = {
  cafe: [10_500, 21_000],
  ramen: [9_000, 18_000],
  arcade: [9_500, 19_000],
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Kleine Raumdetails bleiben bewusst selten. Mehr Gäste verkürzen nur den Abstand,
 * statt die Geräuschkulisse dauerhaft dichter oder lauter zu machen.
 */
export function soundDetailDelayMs(venue: VenueKind, guestCount: number, randomValue: number): number {
  const [minimum, maximum] = DETAIL_INTERVALS[venue];
  const crowd = clamp(guestCount / 8);
  const base = minimum + (maximum - minimum) * clamp(randomValue);
  return Math.round(base * (1 - crowd * 0.16));
}

export class CafeAudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private rain?: AudioBufferSourceNode;
  private wind?: AudioBufferSourceNode;
  private rainLowpass?: BiquadFilterNode;
  private rainPan?: StereoPannerNode;
  private windFilter?: BiquadFilterNode;
  private windPan?: StereoPannerNode;
  private rainBus?: GainNode;
  private windBus?: GainNode;
  private exteriorBus?: GainNode;
  private exteriorFilter?: BiquadFilterNode;
  private roomBus?: GainNode;
  private musicBus?: GainNode;
  private bedBus?: GainNode;
  private effectsBus?: GainNode;
  private sampleBus?: GainNode;
  private sampleAtmosphere?: AudioBufferSourceNode;
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private sampleState: VenueSampleState = 'idle';
  private sampleGeneration = 0;
  private reverbReturn?: GainNode;
  private scheduler?: number;
  private detailTimer?: number;
  private nextNoteAt = 0;
  private step = 0;
  private muted = false;
  private state: AudioState = 'idle';
  private readonly random = new SeededRandom(0x1a22_2026);
  private atmosphere?: CafeEnvironmentSnapshot;
  private atmosphereWave?: AtmosphereSnapshot;
  private atmosphereWaveSignature = 'none';
  private guestCount = 0;
  private atmosphereSignature = '';
  private venue: VenueKind = 'cafe';

  async start(activatedContext?: AudioContext): Promise<AudioState> {
    if (this.context) {
      await this.context.resume();
      this.applyVolume(0.25);
      return this.getState();
    }

    if (typeof AudioContext === 'undefined') {
      this.state = 'unavailable';
      return this.state;
    }

    const context = activatedContext ?? new AudioContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.createBuses();
    this.createRain();
    this.createWind();
    this.createRoomTone();
    this.createRoomReverb();
    this.nextNoteAt = context.currentTime + 0.12;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 180);
    this.scheduleNextDetail();
    this.scheduleMusic();
    await context.resume();
    this.state = 'playing';
    this.applyAtmosphere();
    this.applyVolume(0.9);
    void this.loadSelectedVenueSamples();
    return this.getState();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context) this.applyVolume(0.2);
    if (this.state !== 'unavailable' && this.state !== 'idle') this.state = muted ? 'muted' : 'playing';
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  fadeForVisibility(hidden: boolean): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const target = hidden || this.muted ? 0.0001 : 0.32;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(target, context.currentTime, hidden ? 0.16 : 0.45);
  }

  setAtmosphere(snapshot: CafeEnvironmentSnapshot, guestCount: number): void {
    this.atmosphere = snapshot;
    this.guestCount = Math.max(0, Math.min(8, guestCount));
    const signature = [
      snapshot.dayPhase,
      snapshot.weather.kind,
      snapshot.weather.rain.toFixed(1),
      snapshot.weather.showers.toFixed(1),
      snapshot.weather.snowfall.toFixed(1),
      snapshot.weather.windSpeed.toFixed(0),
      snapshot.weather.windGusts.toFixed(0),
      snapshot.weather.windDirection.toFixed(0),
      this.guestCount,
      this.venue,
    ].join('|');
    if (signature === this.atmosphereSignature) return;
    this.atmosphereSignature = signature;
    this.applyAtmosphere();
  }

  setAtmosphereWave(snapshot: AtmosphereSnapshot): void {
    this.atmosphereWave = snapshot;
    const signature = snapshot.wave === 'none' ? 'none' : `${snapshot.wave}:${snapshot.seed}`;
    if (signature !== this.atmosphereWaveSignature) {
      this.atmosphereWaveSignature = signature;
      if (snapshot.wave !== 'none') this.playAtmosphereAccent(snapshot);
    }
    this.applyAtmosphere();
  }

  getLayerSummary(): string {
    const voice = VENUE_ATMOSPHERE_PROFILES[this.venue].musicVoice;
    const sample = this.sampleState === 'ready' || this.sampleState === 'partial' ? 'sample' : 'procedural';
    const wave = this.atmosphereWave?.wave ?? 'none';
    return `exterior-glass|room-${this.venue}|music-${voice}|${sample}|wave-${wave}`;
  }

  setVenue(venue: VenueKind): void {
    if (this.venue === venue) return;
    this.venue = venue;
    this.atmosphereSignature = '';
    if (this.detailTimer !== undefined) {
      window.clearTimeout(this.detailTimer);
      this.detailTimer = undefined;
      this.scheduleNextDetail();
    }
    this.applyAtmosphere();
    if (this.context) void this.loadSelectedVenueSamples();
  }

  playAccident(kind: AccidentKind): void {
    const context = this.context;
    if (!context || !this.master || this.muted || this.state !== 'playing') return;
    const start = context.currentTime + 0.02;
    this.duckBed(0.48, 0.32);

    if (kind === 'tray-drop') {
      this.playEffectTone(1_850, 620, start, 0.22, 0.065, 'square');
      this.playEffectTone(2_480, 940, start + 0.055, 0.18, 0.045, 'triangle');
      this.playEffectTone(3_100, 1_300, start + 0.1, 0.14, 0.032, 'square');
      this.playEffectNoise(start, 0.34, 1_900, 2.2, 0.055);
      return;
    }

    if (kind === 'coffee-spill') {
      this.playEffectNoise(start, 0.46, 760, 0.75, 0.04);
      this.playEffectTone(420, 210, start + 0.03, 0.25, 0.028, 'sine');
      return;
    }

    this.playEffectTone(145, 64, start, 0.34, 0.075, 'triangle');
    this.playEffectNoise(start, 0.16, 330, 0.9, 0.045);
  }

  playMoment(kind: CafeMomentKind): void {
    const context = this.context;
    if (!context || !this.master || this.muted || this.state !== 'playing') return;
    const start = context.currentTime + 0.02;
    this.duckBed(0.76, 0.14);
    const definition = momentDefinition(kind);
    if (definition) {
      for (const cue of definition.cues.filter((entry): entry is MomentFoleyCue => entry.type === 'foley')) {
        const cueStart = start + cue.atSeconds;
        if (!this.playSample(cue.cue, cueStart, cue)) this.playProceduralMomentCue(cue, cueStart);
      }
      return;
    }
    if (kind === 'shared-cake') {
      this.playEffectTone(1_380, 1_720, start, 0.12, 0.024, 'sine');
      this.playEffectTone(1_660, 1_980, start + 0.05, 0.1, 0.019, 'sine');
      return;
    }
    if (kind === 'card-game') {
      this.playEffectNoise(start, 0.16, 1_300, 0.7, 0.012);
      this.playEffectNoise(start + 0.18, 0.11, 1_050, 0.6, 0.009);
      return;
    }
    if (kind === 'window-gaze') {
      this.playEffectTone(730, 920, start, 0.4, 0.012, 'sine');
      return;
    }
    if (kind === 'ramen-slurp') {
      this.playEffectNoise(start, 0.22, 680, 0.8, 0.018);
      this.playEffectTone(330, 510, start + 0.05, 0.18, 0.018, 'sine');
      return;
    }
    if (kind === 'arcade-duel' || kind === 'arcade-high-score') {
      this.playEffectTone(680, 1_150, start, 0.11, 0.022, 'square');
      this.playEffectTone(1_020, 1_580, start + 0.08, 0.16, 0.019, 'triangle');
      return;
    }
    if (kind === 'umbrella-handoff') {
      this.playEffectNoise(start, 0.14, 1_150, 0.7, 0.012);
      this.playEffectTone(920, 1_140, start + 0.05, 0.14, 0.012, 'sine');
      return;
    }
    if (kind === 'foam-moustache' || kind === 'steam-glasses') {
      this.playEffectTone(920, 1_380, start, 0.13, 0.012, 'sine');
      this.playEffectTone(1_420, 1_780, start + 0.08, 0.11, 0.009, 'triangle');
      return;
    }
    if (kind === 'sugar-packet-domino' || kind === 'chopstick-drop') {
      this.playEffectTone(1_250, 720, start, 0.07, 0.012, 'triangle');
      this.playEffectTone(1_020, 620, start + 0.09, 0.08, 0.009, 'triangle');
      return;
    }
    if (kind === 'ticket-stream' || kind === 'button-mash-sync') {
      this.playEffectTone(520, 920, start, 0.09, 0.012, 'square');
      this.playEffectTone(780, 1_260, start + 0.08, 0.11, 0.01, 'square');
      return;
    }
    this.playEffectTone(1_120, 1_520, start, 0.16, 0.015, 'triangle');
  }

  private playProceduralMomentCue(cue: MomentFoleyCue, start: number): void {
    const base: Readonly<Record<string, readonly [number, number]>> = {
      cup: [920, 1_220], plate: [1_450, 1_050], chair: [260, 180], 'door-bell': [1_720, 2_180],
      bowl: [820, 1_080], ladle: [1_360, 780], curtain: [420, 310], condiment: [1_020, 760],
      button: [620, 980], coin: [1_650, 2_240], ticket: [880, 1_180], relay: [310, 520],
    };
    const [from, to] = base[cue.cue] ?? [1_120, 1_520];
    this.playEffectTone(from, to, start, 0.12, 0.018 * cue.gain, this.venue === 'arcade' ? 'square' : 'triangle', undefined, cue.pan);
  }

  playReaction(): boolean {
    const context = this.context;
    if (!context || !this.master || this.muted || this.state !== 'playing') return false;
    const start = context.currentTime + 0.015;
    const frequencies: Readonly<Record<VenueKind, readonly [number, number]>> = {
      cafe: [880, 1_120],
      ramen: [660, 880],
      arcade: [740, 1_180],
    };
    const [from, to] = frequencies[this.venue];
    this.playEffectTone(from, to, start, 0.11, REACTION_ACCENT_MAX_GAIN, this.venue === 'arcade' ? 'square' : 'sine');
    return true;
  }

  getState(): AudioState {
    if (this.state === 'playing' && this.muted) return 'muted';
    return this.state;
  }

  getSampleState(): VenueSampleState {
    return this.sampleState;
  }

  async destroy(): Promise<void> {
    if (this.scheduler !== undefined) window.clearInterval(this.scheduler);
    if (this.detailTimer !== undefined) window.clearTimeout(this.detailTimer);
    this.rain?.stop();
    this.wind?.stop();
    this.sampleAtmosphere?.stop();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = undefined;
    this.master = undefined;
    this.rainBus = undefined;
    this.windBus = undefined;
    this.exteriorBus = undefined;
    this.exteriorFilter = undefined;
    this.roomBus = undefined;
    this.musicBus = undefined;
    this.bedBus = undefined;
    this.effectsBus = undefined;
    this.sampleBus = undefined;
    this.sampleBuffers.clear();
    this.sampleState = 'idle';
    this.reverbReturn = undefined;
    this.rainLowpass = undefined;
    this.rainPan = undefined;
    this.windFilter = undefined;
    this.windPan = undefined;
    this.state = 'idle';
  }

  private createBuses(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    this.rainBus = context.createGain();
    this.windBus = context.createGain();
    this.exteriorBus = context.createGain();
    this.exteriorFilter = context.createBiquadFilter();
    this.roomBus = context.createGain();
    this.musicBus = context.createGain();
    this.bedBus = context.createGain();
    this.effectsBus = context.createGain();
    this.sampleBus = context.createGain();
    this.rainBus.gain.value = 0.0001;
    this.windBus.gain.value = 0.0001;
    this.roomBus.gain.value = 0.32;
    this.musicBus.gain.value = 0.8;
    this.bedBus.gain.value = 1;
    this.effectsBus.gain.value = 0.82;
    this.sampleBus.gain.value = 0.0001;
    this.exteriorFilter.type = 'lowpass';
    this.exteriorFilter.frequency.value = 1_250;
    this.rainBus.connect(this.exteriorBus);
    this.windBus.connect(this.exteriorBus);
    this.exteriorBus.connect(this.exteriorFilter).connect(this.bedBus);
    for (const bus of [this.roomBus, this.musicBus]) bus.connect(this.bedBus);
    this.bedBus.connect(master);
    this.effectsBus.connect(master);
    this.sampleBus.connect(master);
  }

  private async loadSelectedVenueSamples(): Promise<void> {
    const context = this.context;
    const sampleBus = this.sampleBus;
    if (!context || !sampleBus) return;
    const venue = this.venue;
    const generation = ++this.sampleGeneration;
    this.sampleState = 'loading';
    const pack = await loadVenueSamplePack(context, venue);
    if (generation !== this.sampleGeneration || venue !== this.venue || !this.context) return;
    this.sampleAtmosphere?.stop();
    this.sampleAtmosphere = undefined;
    this.sampleBuffers.clear();
    for (const [id, buffer] of pack.buffers) this.sampleBuffers.set(id, buffer);
    this.sampleState = pack.state;
    if (pack.state === 'fallback') return;
    const atmosphere = this.sampleBuffers.get(`${venue}-atmosphere`);
    if (!atmosphere) {
      this.sampleState = 'fallback';
      return;
    }
    const entry = samplesForVenue(venue).find((sample) => sample.cue === 'atmosphere');
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = atmosphere;
    source.loop = true;
    gain.gain.value = entry?.level ?? 0.15;
    source.connect(gain).connect(sampleBus);
    const now = context.currentTime;
    sampleBus.gain.cancelScheduledValues(now);
    sampleBus.gain.setValueAtTime(0.0001, now);
    sampleBus.gain.linearRampToValueAtTime(1, now + 2.5);
    source.start(now);
    this.sampleAtmosphere = source;
  }

  private playSample(cue: string, start: number, staging?: MomentFoleyCue): boolean {
    const context = this.context;
    const sampleBus = this.sampleBus;
    if (!context || !sampleBus || (this.sampleState !== 'ready' && this.sampleState !== 'partial')) return false;
    const entry = samplesForVenue(this.venue).find((sample) => sample.cue === cue);
    const buffer = entry ? this.sampleBuffers.get(entry.id) : undefined;
    if (!entry || !buffer) return false;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    const rate = staging ? cuePlaybackRate(staging.playbackRate, this.random.next()) : 1;
    source.playbackRate.setValueAtTime(rate, start);
    const level = entry.level * (staging?.gain ?? 1);
    const attack = staging?.attackSeconds ?? 0.008;
    const release = staging?.releaseSeconds ?? 0.08;
    const audibleDuration = Math.max(attack + release + 0.02, Math.min(buffer.duration / rate, 0.9));
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.01, audibleDuration - release));
    panner.pan.setValueAtTime(clampStereoPan(staging?.pan ?? 0), start);
    source.connect(gain).connect(panner).connect(sampleBus);
    source.start(start);
    return true;
  }

  private createRain(): void {
    const context = this.context;
    const rainBus = this.rainBus;
    if (!context || !rainBus) return;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = this.random.next() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      channel[index] = last * 0.62;
    }
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    const pan = context.createStereoPanner();
    source.buffer = buffer;
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 380;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3900;
    gain.gain.value = 0.12;
    source.connect(highpass).connect(lowpass).connect(gain).connect(pan).connect(rainBus);
    source.start();
    this.rain = source;
    this.rainLowpass = lowpass;
    this.rainPan = pan;
  }

  private createWind(): void {
    const context = this.context;
    const windBus = this.windBus;
    if (!context || !windBus) return;
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < channel.length; index += 1) {
      smoothed = smoothed * 0.94 + (this.random.next() * 2 - 1) * 0.06;
      channel[index] = smoothed;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 460;
    filter.Q.value = 0.5;
    source.connect(filter).connect(pan).connect(windBus);
    source.start();
    this.wind = source;
    this.windFilter = filter;
    this.windPan = pan;
  }

  private createRoomTone(): void {
    const context = this.context;
    const roomBus = this.roomBus;
    if (!context || !roomBus) return;
    for (const [frequency, volume] of [[55, 0.012], [82.4, 0.007]] as const) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      gain.gain.value = volume;
      oscillator.connect(filter).connect(gain).connect(roomBus);
      oscillator.start();
    }
  }

  private createRoomReverb(): void {
    const context = this.context;
    const roomBus = this.roomBus;
    const musicBus = this.musicBus;
    const bedBus = this.bedBus;
    if (!context || !roomBus || !musicBus || !bedBus) return;
    const reverb = context.createConvolver();
    const returnBus = context.createGain();
    const length = Math.round(context.sampleRate * 1.15);
    const impulse = context.createBuffer(1, length, context.sampleRate);
    const channel = impulse.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const decay = (1 - index / channel.length) ** 2.6;
      channel[index] = (this.random.next() * 2 - 1) * decay;
    }
    reverb.buffer = impulse;
    returnBus.gain.value = 0.09;
    roomBus.connect(reverb);
    musicBus.connect(reverb);
    reverb.connect(returnBus).connect(bedBus);
    this.reverbReturn = returnBus;
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    while (this.nextNoteAt < context.currentTime + 0.7) {
      const beat = this.step % 16;
      const chordIndex = Math.floor(this.step / 16) % CHORDS.length;
      const chord = CHORDS[chordIndex] ?? CHORDS[0];
      const arcade = this.venue === 'arcade';
      const ramen = this.venue === 'ramen';
      const night = this.atmosphere?.dayPhase === 'night' || this.atmosphere?.dayPhase === 'evening';
      const waveAmount = this.atmosphereWave?.intensity ?? 0;
      if (beat % 4 === 0) {
        const root = chord?.[0] ?? 0;
        const bassNote = (arcade ? 42 : ramen ? 35 : 38) + root;
        this.playNote(this.midiToFrequency(bassNote), this.nextNoteAt, ramen ? 0.72 : 0.62, night ? 0.032 : 0.045, arcade ? 'sine' : 'triangle');
      }
      if ((beat % 8 === 2 || (beat % 8 === 6 && !ramen)) && this.random.next() < 0.88 + waveAmount * 0.1) {
        for (const interval of chord ?? []) {
          this.playNote(this.midiToFrequency((ramen ? 55 : 57) + interval), this.nextNoteAt, ramen ? 1.45 : 1.2, night ? 0.008 : 0.012, 'sine');
        }
      }
      if ([1, 5, 10, 13].includes(beat) && this.random.next() > (ramen ? 0.42 : 0.24)) {
        const interval = this.random.pick(chord ?? [0]);
        const octave = this.random.next() > (arcade ? 0.58 : 0.7) ? 12 : 0;
        this.playNote(this.midiToFrequency((arcade ? 69 : ramen ? 64 : 69) + interval + octave), this.nextNoteAt, 0.36, night ? 0.011 : 0.018, arcade ? 'square' : 'triangle');
      }
      const pace = (this.venue === 'ramen' ? 0.46 : arcade ? 0.37 : 0.42) * (1 - waveAmount * 0.035);
      this.nextNoteAt += pace + (beat % 4 === 3 ? 0.025 : -0.008);
      this.step += 1;
    }
  }

  private playNote(frequency: number, start: number, duration: number, volume: number, type: OscillatorType): void {
    const context = this.context;
    const musicBus = this.musicBus;
    if (!context || !musicBus) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(this.random.range(-7, 7), start);
    filter.type = 'lowpass';
    const night = this.atmosphere?.dayPhase === 'night' || this.atmosphere?.dayPhase === 'evening';
    const waveBrightness = (this.atmosphereWave?.wave === 'sunbreak' ? 520 : 0) * (this.atmosphereWave?.intensity ?? 0);
    filter.frequency.value = (night ? 920 : 1_450) + waveBrightness;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter).connect(gain).connect(musicBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private playEffectTone(
    fromFrequency: number,
    toFrequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    destination?: AudioNode,
    pan = 0,
  ): void {
    const context = this.context;
    const output = destination ?? this.effectsBus ?? this.master;
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    panner.pan.setValueAtTime(clampStereoPan(pan), start);
    oscillator.connect(gain).connect(panner).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private playEffectNoise(
    start: number,
    duration: number,
    frequency: number,
    q: number,
    volume: number,
    destination?: AudioNode,
  ): void {
    const context = this.context;
    const output = destination ?? this.effectsBus ?? this.master;
    if (!context || !output) return;
    const buffer = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * duration)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = 1 - index / data.length;
      data[index] = (this.random.next() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(output);
    source.start(start);
    source.stop(start + duration + 0.03);
  }

  private scheduleNextDetail(): void {
    if (!this.context) return;
    const delay = soundDetailDelayMs(this.venue, this.guestCount, this.random.next());
    this.detailTimer = window.setTimeout(() => {
      this.detailTimer = undefined;
      this.scheduleCafeSound();
      this.scheduleNextDetail();
    }, delay);
  }

  private scheduleCafeSound(): void {
    const context = this.context;
    const roomBus = this.roomBus;
    if (!context || !roomBus || this.guestCount === 0 || this.muted) return;
    if (this.random.next() > 0.22 + this.guestCount / 11) return;
    const now = context.currentTime + 0.05;
    if (this.venue === 'ramen') {
      this.playRamenDetail(now, roomBus);
      return;
    }
    if (this.venue === 'arcade') {
      this.playArcadeDetail(now, roomBus);
      return;
    }
    this.playCafeDetail(now, roomBus);
  }

  private playCafeDetail(now: number, roomBus: GainNode): void {
    const detail = this.random.integer(0, 2);
    if (detail === 0) {
      this.playEffectTone(1_650, 2_260, now, 0.08, 0.014, 'sine', roomBus);
      this.playEffectTone(2_180, 1_760, now + 0.045, 0.09, 0.01, 'sine', roomBus);
      return;
    }
    if (detail === 1) {
      this.playEffectNoise(now, 0.28, 520, 0.8, 0.011, roomBus);
      this.playEffectTone(220, 160, now + 0.03, 0.24, 0.01, 'sine', roomBus);
      return;
    }
    this.playEffectNoise(now, 0.12, 1_050, 1.3, 0.009, roomBus);
    this.playEffectTone(740, 1_040, now + 0.04, 0.12, 0.008, 'triangle', roomBus);
  }

  private playRamenDetail(now: number, roomBus: GainNode): void {
    const detail = this.random.integer(0, 2);
    if (detail === 0) {
      this.playEffectTone(780, 1_120, now, 0.11, 0.014, 'sine', roomBus);
      this.playEffectTone(1_150, 820, now + 0.07, 0.09, 0.01, 'triangle', roomBus);
      return;
    }
    if (detail === 1) {
      this.playEffectNoise(now, 0.34, 410, 0.6, 0.011, roomBus);
      this.playEffectTone(170, 130, now + 0.08, 0.3, 0.008, 'sine', roomBus);
      return;
    }
    this.playEffectTone(1_560, 1_240, now, 0.055, 0.009, 'triangle', roomBus);
    this.playEffectTone(1_900, 1_520, now + 0.1, 0.05, 0.008, 'triangle', roomBus);
  }

  private playArcadeDetail(now: number, roomBus: GainNode): void {
    const detail = this.random.integer(0, 2);
    if (detail === 0) {
      this.playEffectTone(460, 690, now, 0.08, 0.01, 'square', roomBus);
      if (this.random.next() > 0.5) this.playEffectTone(740, 1_080, now + 0.11, 0.07, 0.007, 'square', roomBus);
      return;
    }
    if (detail === 1) {
      this.playEffectTone(1_280, 1_520, now, 0.035, 0.007, 'square', roomBus);
      this.playEffectTone(1_610, 1_240, now + 0.06, 0.04, 0.006, 'square', roomBus);
      return;
    }
    this.playEffectNoise(now, 0.07, 2_400, 2.2, 0.006, roomBus);
    this.playEffectTone(300, 470, now + 0.025, 0.1, 0.007, 'sine', roomBus);
  }

  private duckBed(target: number, recovery: number): void {
    const context = this.context;
    const bedBus = this.bedBus;
    if (!context || !bedBus) return;
    const now = context.currentTime;
    bedBus.gain.cancelScheduledValues(now);
    bedBus.gain.setTargetAtTime(target, now, 0.035);
    bedBus.gain.setTargetAtTime(1, now + recovery, 0.42);
  }

  private applyVolume(timeConstant: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const target = this.muted ? 0.0001 : 0.32;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(target, context.currentTime, timeConstant);
  }

  private applyAtmosphere(): void {
    const context = this.context;
    const atmosphere = this.atmosphere;
    if (!context || !atmosphere) return;
    const now = context.currentTime;
    const setTarget = (node: GainNode | undefined, value: number): void => {
      if (!node) return;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(Math.max(0.0001, value), now, 1.6);
    };
    const setParameter = (parameter: AudioParam | undefined, value: number, timeConstant = 1.6): void => {
      if (!parameter) return;
      parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(value, now, timeConstant);
    };
    const rain = Math.min(1, (atmosphere.weather.rain + atmosphere.weather.showers) / 5 + (atmosphere.weather.kind === 'storm' ? 0.45 : 0));
    const wind = Math.min(1, atmosphere.weather.windSpeed / 60 + atmosphere.weather.windGusts / 180);
    const wave = this.atmosphereWave;
    const waveAmount = wave?.intensity ?? 0;
    const night = atmosphere.dayPhase === 'night' || atmosphere.dayPhase === 'evening';
    const windAngle = atmosphere.weather.windDirection * Math.PI / 180;
    setTarget(this.rainBus, Math.min(1, rain + (wave?.wave === 'rain-surge' ? waveAmount * 0.42 : 0)));
    setTarget(this.windBus, Math.min(0.3, wind * 0.16 + (wave?.wave === 'wind-gust' ? waveAmount * 0.12 : 0)));
    setParameter(this.rainLowpass?.frequency, (night ? 2_400 : 3_400) + rain * 900);
    setParameter(this.rainPan?.pan, Math.sin(windAngle) * 0.42);
    setParameter(this.windFilter?.frequency, 350 + wind * 420);
    setParameter(this.windPan?.pan, -Math.sin(windAngle) * 0.34);
    setParameter(this.exteriorFilter?.frequency, 980 + (wave?.wave === 'distant-thunder' ? waveAmount * 380 : 0), 0.8);
    const roomBase = this.venue === 'arcade' ? 0.24 : this.venue === 'ramen' ? 0.29 : 0.32;
    const musicBase = this.venue === 'arcade' ? 0.68 : this.venue === 'ramen' ? 0.72 : 0.92;
    const reverbBase = this.venue === 'arcade' ? 0.055 : this.venue === 'ramen' ? 0.07 : 0.09;
    setTarget(this.roomBus, roomBase + this.guestCount / 12);
    const musicWave = wave?.venueSignature ? waveAmount * 0.12 : wave?.wave === 'sunbreak' ? waveAmount * 0.08 : 0;
    setTarget(this.musicBus, (night ? musicBase * 0.7 : musicBase) + musicWave);
    setTarget(this.reverbReturn, reverbBase + (night ? 0.025 : 0) + rain * 0.012 + waveAmount * 0.018);
  }

  private playAtmosphereAccent(snapshot: AtmosphereSnapshot): void {
    const context = this.context;
    if (!context || !this.bedBus || this.muted || this.state !== 'playing') return;
    const start = context.currentTime + 0.03;
    const room = this.roomBus ?? this.bedBus;
    const exterior = this.exteriorBus ?? this.bedBus;
    if (snapshot.wave === 'distant-thunder') {
      this.playEffectNoise(start, 0.72, 150, 0.48, 0.018, exterior);
      this.playEffectTone(92, 54, start + 0.08, 0.65, 0.012, 'sine', exterior, -0.32);
      return;
    }
    if (snapshot.wave === 'traffic-glow' || snapshot.wave === 'pedestrian-poetry') {
      this.playEffectNoise(start, 0.34, snapshot.wave === 'traffic-glow' ? 420 : 690, 0.55, 0.0045, exterior);
      return;
    }
    if (snapshot.wave === 'cafe-espresso-cycle') {
      this.playEffectNoise(start, 0.58, 1_120, 0.8, 0.009, room);
      this.playEffectTone(190, 145, start + 0.05, 0.48, 0.006, 'sine', room, 0.62);
      return;
    }
    if (snapshot.wave === 'ramen-broth-breath') {
      this.playEffectNoise(start, 0.72, 360, 0.55, 0.008, room);
      this.playEffectTone(118, 92, start + 0.08, 0.62, 0.005, 'sine', room, -0.18);
      return;
    }
    if (snapshot.wave === 'arcade-machine-chorus') {
      for (const [index, note] of [220, 277, 330].entries()) {
        this.playEffectTone(note, note * 1.01, start + index * 0.08, 0.72, 0.004, 'square', room, -0.55 + index * 0.55);
      }
      return;
    }
    if (snapshot.wave === 'wind-gust' || snapshot.wave === 'rain-surge') {
      this.playEffectNoise(start, 0.46, snapshot.wave === 'wind-gust' ? 520 : 1_450, 0.6, 0.004, exterior);
    }
  }

  private midiToFrequency(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
  }
}
