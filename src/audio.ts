import { SeededRandom } from './simulation/random';

export type AudioState = 'idle' | 'playing' | 'muted' | 'unavailable';

const CHORDS = [
  [0, 3, 7, 10],
  [5, 9, 12, 16],
  [10, 14, 17, 21],
  [3, 7, 10, 14],
] as const;

export class CafeAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private rain?: AudioBufferSourceNode;
  private scheduler?: number;
  private effectsTimer?: number;
  private nextNoteAt = 0;
  private step = 0;
  private muted = false;
  private state: AudioState = 'idle';
  private readonly random = new SeededRandom(0x1a22_2026);

  async start(): Promise<AudioState> {
    if (this.context) {
      await this.context.resume();
      this.applyVolume(0.25);
      return this.getState();
    }

    if (typeof AudioContext === 'undefined') {
      this.state = 'unavailable';
      return this.state;
    }

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.createRain();
    this.createRoomTone();
    this.nextNoteAt = context.currentTime + 0.12;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 180);
    this.effectsTimer = window.setInterval(() => this.scheduleCafeSound(), 7200);
    this.scheduleMusic();
    await context.resume();
    this.state = 'playing';
    this.applyVolume(0.9);
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

  getState(): AudioState {
    if (this.state === 'playing' && this.muted) return 'muted';
    return this.state;
  }

  async destroy(): Promise<void> {
    if (this.scheduler) window.clearInterval(this.scheduler);
    if (this.effectsTimer) window.clearInterval(this.effectsTimer);
    this.rain?.stop();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = undefined;
    this.master = undefined;
    this.state = 'idle';
  }

  private createRain(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
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
    source.buffer = buffer;
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 380;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3900;
    gain.gain.value = 0.12;
    source.connect(highpass).connect(lowpass).connect(gain).connect(master);
    source.start();
    this.rain = source;
  }

  private createRoomTone(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    for (const [frequency, volume] of [[55, 0.012], [82.4, 0.007]] as const) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      gain.gain.value = volume;
      oscillator.connect(filter).connect(gain).connect(master);
      oscillator.start();
    }
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || !this.master) return;
    while (this.nextNoteAt < context.currentTime + 0.7) {
      const beat = this.step % 16;
      const chordIndex = Math.floor(this.step / 16) % CHORDS.length;
      const chord = CHORDS[chordIndex] ?? CHORDS[0];
      if (beat % 4 === 0) {
        const root = chord?.[0] ?? 0;
        this.playNote(this.midiToFrequency(38 + root), this.nextNoteAt, 0.62, 0.045, 'triangle');
      }
      if (beat % 8 === 2 || beat % 8 === 6) {
        for (const interval of chord ?? []) {
          this.playNote(this.midiToFrequency(57 + interval), this.nextNoteAt, 1.2, 0.012, 'sine');
        }
      }
      if ([1, 5, 10, 13].includes(beat) && this.random.next() > 0.24) {
        const interval = this.random.pick(chord ?? [0]);
        const octave = this.random.next() > 0.7 ? 12 : 0;
        this.playNote(this.midiToFrequency(69 + interval + octave), this.nextNoteAt, 0.36, 0.018, 'triangle');
      }
      this.nextNoteAt += 0.42 + (beat % 4 === 3 ? 0.025 : -0.008);
      this.step += 1;
    }
  }

  private playNote(frequency: number, start: number, duration: number, volume: number, type: OscillatorType): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(this.random.range(-7, 7), start);
    filter.type = 'lowpass';
    filter.frequency.value = 1350;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter).connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private scheduleCafeSound(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime + 0.05;
    if (this.random.next() > 0.36) {
      for (const [offset, frequency] of [[0, 1650], [0.045, 2230]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.018, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);
        oscillator.connect(gain).connect(master);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.14);
      }
      return;
    }
    const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.7), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (this.random.next() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 720;
    filter.Q.value = 1.7;
    gain.gain.value = 0.025;
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
  }

  private applyVolume(timeConstant: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const target = this.muted ? 0.0001 : 0.32;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(target, context.currentTime, timeConstant);
  }

  private midiToFrequency(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
  }
}
