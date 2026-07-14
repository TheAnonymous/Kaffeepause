import {
  BARISTA_PLACES,
  ENTRANCE,
  GUEST_RADIUS,
  OUTSIDE,
  QUEUE_PLACES,
  SEATS,
  WAIT_PLACES,
  WORLD_WIDTH,
  pointHitsCafeCollider,
  type Place,
} from './layout';
import { SeededRandom } from './random';
import { ReservationManager } from './reservations';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type {
  AccidentKind,
  AccidentPhase,
  Barista,
  CafeAccident,
  CafeMoment,
  CafeMomentKind,
  CafeStoryKind,
  Guest,
  GuestActivity,
  GuestPalette,
  Point,
  RegularId,
  SimulationStats,
} from './types';

const NAMES = ['Fritzi', 'Eli', 'Jun', 'Pia', 'Mika', 'Romy'] as const;
const ACTIVITIES: readonly GuestActivity[] = [
  'reading', 'typing', 'talking', 'drinking', 'phone', 'sketching', 'journaling', 'knitting', 'board-game',
];
const PALETTES: readonly GuestPalette[] = [
  { skin: '#d8a071', hair: '#3a252b', coat: '#557b78', accent: '#e5b568' },
  { skin: '#8f5c48', hair: '#241c25', coat: '#a5544e', accent: '#e6c589' },
  { skin: '#edc39a', hair: '#6d4938', coat: '#5c668c', accent: '#d98f5f' },
  { skin: '#b87957', hair: '#33272a', coat: '#8a684f', accent: '#77a095' },
  { skin: '#e1aa7f', hair: '#b16a46', coat: '#677348', accent: '#e2bc72' },
  { skin: '#71483c', hair: '#191820', coat: '#6d5278', accent: '#c98668' },
];

interface RegularProfile {
  id: RegularId;
  name: string;
  palette: GuestPalette;
  favoriteActivity: GuestActivity;
}

const REGULARS: readonly RegularProfile[] = [
  { id: 'mara', name: 'Mara', palette: { skin: '#d8a071', hair: '#2d242b', coat: '#557b78', accent: '#e5b568' }, favoriteActivity: 'sketching' },
  { id: 'noor', name: 'Noor', palette: { skin: '#8f5c48', hair: '#241c25', coat: '#a5544e', accent: '#e6c589' }, favoriteActivity: 'talking' },
  { id: 'toni', name: 'Toni', palette: { skin: '#edc39a', hair: '#6d4938', coat: '#5c668c', accent: '#d98f5f' }, favoriteActivity: 'drinking' },
  { id: 'linn', name: 'Linn', palette: { skin: '#b87957', hair: '#33272a', coat: '#6d5278', accent: '#77a095' }, favoriteActivity: 'knitting' },
];

export interface CafeSimulationOptions {
  seed?: number;
  initialGuests?: number;
  minGuests?: number;
  maxGuests?: number;
  durationScale?: number;
  accidents?: CafeAccidentOptions | false;
  moments?: CafeMomentOptions | false;
  stories?: CafeStoryOptions | false;
}

export interface CafeAccidentOptions {
  enabled?: boolean;
  seed?: number;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  kinds?: readonly AccidentKind[];
  phaseDurationScale?: number;
}

export interface CafeMomentOptions {
  enabled?: boolean;
  seed?: number;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  kinds?: readonly CafeMomentKind[];
  durationScale?: number;
}

export interface CafeStoryOptions {
  enabled?: boolean;
  seed?: number;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  kinds?: readonly CafeStoryKind[];
}

const ACCIDENT_KINDS: readonly AccidentKind[] = ['tray-drop', 'coffee-spill', 'umbrella-pop'];
const MOMENT_KINDS: readonly CafeMomentKind[] = [
  'shared-cake', 'card-game', 'window-gaze', 'sketch-reveal',
];
const STORY_KINDS: readonly CafeStoryKind[] = ['sketchbook', 'first-date', 'knit-gift'];
const ACCIDENT_PHASE_DURATIONS: Readonly<Record<AccidentPhase, number>> = {
  startle: 0.9,
  chaos: 1.8,
  cleanup: 2.6,
};
const MOMENT_DURATIONS: Readonly<Record<CafeMomentKind, number>> = {
  'shared-cake': 13,
  'card-game': 16,
  'window-gaze': 10,
  'sketch-reveal': 11,
  'first-date-toast': 11,
  'knit-gift': 12,
};

interface GuestSnapshot {
  state: Guest['state'];
  activity: GuestActivity;
  target: Point;
  waypoints?: Point[];
  facing: Guest['facing'];
  stateTime: number;
  stateDuration: number;
  animation: number;
  activityRounds: number;
  seatId?: string;
  destinationId?: string;
  reservedResources: readonly string[];
}

interface StoryMomentCandidate {
  kind: CafeMomentKind;
  story: CafeStoryKind;
  step: 1 | 2;
  participants: readonly Guest[];
}

interface BaristaSnapshot {
  position: Point;
  target: Point;
  task: Barista['task'];
  taskTime: number;
  taskDuration: number;
  animation: number;
  facing: Barista['facing'];
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function copyPoints(points?: readonly Point[]): Point[] | undefined {
  return points?.map(copyPoint);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const NAVIGATION_STEP = 12;
const NAVIGATION_MIN_X = 12;
const NAVIGATION_MAX_X = 264;
const NAVIGATION_MIN_Y = 140;
const NAVIGATION_MAX_Y = 200;

function segmentIsClear(start: Point, end: Point): boolean {
  const steps = Math.max(1, Math.ceil(distance(start, end) / 2));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    if (pointHitsCafeCollider(point)) return false;
  }
  return true;
}

export class CafeSimulation {
  readonly reservations = new ReservationManager();
  readonly guests: Guest[] = [];
  readonly barista: Barista = {
    position: copyPoint(BARISTA_PLACES.machine),
    target: copyPoint(BARISTA_PLACES.machine),
    task: 'machine',
    taskTime: 0,
    taskDuration: 9,
    animation: 0,
    facing: 1,
  };

  readonly stats: SimulationStats = {
    arrivals: 0,
    departures: 0,
    elapsed: 0,
    accidentsCompleted: 0,
    momentsCompleted: 0,
    storyBeatsCompleted: 0,
    storiesCompleted: 0,
  };

  private readonly random: SeededRandom;
  private readonly initialGuests: number;
  private readonly minGuests: number;
  private readonly maxGuests: number;
  private readonly durationScale: number;
  private readonly accidentRandom: SeededRandom;
  private readonly accidentEnabled: boolean;
  private readonly accidentMinDelay: number;
  private readonly accidentMaxDelay: number;
  private readonly accidentKinds: readonly AccidentKind[];
  private readonly accidentPhaseScale: number;
  private readonly momentRandom: SeededRandom;
  private readonly momentEnabled: boolean;
  private readonly momentMinDelay: number;
  private readonly momentMaxDelay: number;
  private readonly momentKinds: readonly CafeMomentKind[];
  private readonly momentDurationScale: number;
  private readonly storyRandom: SeededRandom;
  private readonly storyEnabled: boolean;
  private readonly storyMinDelay: number;
  private readonly storyMaxDelay: number;
  private readonly storyKinds: readonly CafeStoryKind[];
  private started = false;
  private nextGuestId = 1;
  private nextRegularIndex = 0;
  private spawnClock = 0;
  private populationClock = 0;
  private desiredGuestCount: number;
  private accidentCountdown?: number;
  private pendingAccidentKind?: AccidentKind;
  private currentAccident?: CafeAccident;
  private accidentGuestSnapshot?: GuestSnapshot;
  private accidentBaristaSnapshot?: BaristaSnapshot;
  private nextAccidentId = 1;
  private momentCountdown?: number;
  private currentMoment?: CafeMoment;
  private lastMomentKind?: CafeMomentKind;
  private nextMomentId = 1;
  private storyCountdown?: number;
  private readonly storyProgress: Record<CafeStoryKind, number> = {
    sketchbook: 0,
    'first-date': 0,
    'knit-gift': 0,
  };
  private environment?: CafeEnvironmentSnapshot;

  constructor(options: CafeSimulationOptions = {}) {
    this.random = new SeededRandom(options.seed);
    this.minGuests = Math.max(0, Math.min(SEATS.length, options.minGuests ?? 4));
    this.maxGuests = Math.max(this.minGuests, Math.min(8, options.maxGuests ?? 8));
    this.initialGuests = Math.max(0, Math.min(this.maxGuests, options.initialGuests ?? 4));
    this.durationScale = Math.max(0.001, options.durationScale ?? 1);
    this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);

    const accidentOptions = options.accidents === false ? { enabled: false } : (options.accidents ?? {});
    this.accidentEnabled = accidentOptions.enabled !== false;
    this.accidentRandom = new SeededRandom(accidentOptions.seed ?? ((options.seed ?? 0x4b41_4646) ^ 0xacce_2026));
    this.accidentMinDelay = Math.max(0, accidentOptions.minDelaySeconds ?? 240);
    this.accidentMaxDelay = Math.max(this.accidentMinDelay, accidentOptions.maxDelaySeconds ?? 420);
    this.accidentKinds = accidentOptions.kinds?.length ? [...new Set(accidentOptions.kinds)] : ACCIDENT_KINDS;
    this.accidentPhaseScale = Math.max(0.001, accidentOptions.phaseDurationScale ?? 1);

    const momentOptions = options.moments === false ? { enabled: false } : (options.moments ?? {});
    this.momentEnabled = momentOptions.enabled !== false;
    this.momentRandom = new SeededRandom(momentOptions.seed ?? ((options.seed ?? 0x4b41_4646) ^ 0xcafe_2026));
    this.momentMinDelay = Math.max(0, momentOptions.minDelaySeconds ?? 22);
    this.momentMaxDelay = Math.max(this.momentMinDelay, momentOptions.maxDelaySeconds ?? 50);
    this.momentKinds = momentOptions.kinds?.length ? [...new Set(momentOptions.kinds)] : MOMENT_KINDS;
    this.momentDurationScale = Math.max(0.001, momentOptions.durationScale ?? 1);

    const storyOptions = options.stories === false ? { enabled: false } : (options.stories ?? {});
    this.storyEnabled = storyOptions.enabled !== false;
    this.storyRandom = new SeededRandom(storyOptions.seed ?? ((options.seed ?? 0x4b41_4646) ^ 0x5707_2026));
    this.storyMinDelay = Math.max(0, storyOptions.minDelaySeconds ?? 110);
    this.storyMaxDelay = Math.max(this.storyMinDelay, storyOptions.maxDelaySeconds ?? 175);
    this.storyKinds = storyOptions.kinds?.length ? [...new Set(storyOptions.kinds)] : STORY_KINDS;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const initialCount = this.environment
      ? Math.min(this.initialGuests, this.desiredGuestCount, SEATS.length)
      : Math.min(this.initialGuests, SEATS.length);
    for (let index = 0; index < initialCount; index += 1) this.addInitialGuest();
    if (this.accidentEnabled && this.accidentCountdown === undefined) this.scheduleNextAccident();
    if (this.momentEnabled && this.momentCountdown === undefined) this.scheduleNextMoment();
    if (this.storyEnabled && this.storyCountdown === undefined) this.scheduleNextStory();
  }

  stop(): void {
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  get activeAccident(): Readonly<CafeAccident> | undefined {
    return this.currentAccident;
  }

  get activeMoment(): Readonly<CafeMoment> | undefined {
    return this.currentMoment;
  }

  get activeRegulars(): readonly Guest[] {
    return this.guests.filter((guest) => guest.regularId !== undefined);
  }

  getStoryStage(kind: CafeStoryKind): number {
    return this.storyProgress[kind];
  }

  getSecondsUntilNextAccident(): number | undefined {
    return this.currentAccident ? undefined : this.accidentCountdown;
  }

  getSecondsUntilNextMoment(): number | undefined {
    return this.currentMoment ? undefined : this.momentCountdown;
  }

  get crowdTarget(): number {
    return this.desiredGuestCount;
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.environment = snapshot;
    this.desiredGuestCount = Math.max(0, Math.min(this.maxGuests, snapshot.targetCrowd));
    for (const guest of this.guests) this.applyAccessory(guest);
  }

  spawnGuest(): Guest | undefined {
    if (this.guests.length >= this.maxGuests) return undefined;
    const queuePlace = this.findAvailable(QUEUE_PLACES);
    if (!queuePlace) return undefined;

    const guest = this.makeGuest('entering', OUTSIDE);
    this.setGuestTarget(guest, ENTRANCE);
    guest.destinationId = queuePlace.id;
    this.reservations.reserve(queuePlace.id, guest.id);
    this.guests.push(guest);
    this.applyAccessory(guest);
    this.stats.arrivals += 1;
    return guest;
  }

  update(deltaSeconds: number): void {
    if (!this.started) return;
    const delta = Math.min(0.1, Math.max(0, deltaSeconds));
    this.stats.elapsed += delta;
    const pausedGuests = new Set<string>();
    if (this.currentAccident?.guestId) pausedGuests.add(this.currentAccident.guestId);
    if (this.currentAccident?.witnessId) pausedGuests.add(this.currentAccident.witnessId);
    let baristaPaused = this.currentAccident?.kind === 'tray-drop';
    this.updateAccident(delta);
    if (this.currentAccident?.guestId) pausedGuests.add(this.currentAccident.guestId);
    if (this.currentAccident?.witnessId) pausedGuests.add(this.currentAccident.witnessId);
    baristaPaused ||= this.currentAccident?.kind === 'tray-drop';
    if (!this.currentAccident) this.updateMoment(delta);
    this.updatePopulation(delta);
    if (!baristaPaused) this.updateBarista(delta);

    const departed: Guest[] = [];
    const momentGuests = new Set(this.currentMoment?.participantIds ?? []);
    for (const guest of this.guests) {
      if (pausedGuests.has(guest.id)) continue;
      if (!momentGuests.has(guest.id)) guest.stateTime += delta;
      guest.animation += delta * (guest.state.includes('walking') || guest.state === 'entering' ? 8 : 2);
      this.updateGuest(guest, delta, departed);
    }

    for (const guest of departed) {
      this.reservations.releaseAll(guest.id);
      const index = this.guests.indexOf(guest);
      if (index >= 0) this.guests.splice(index, 1);
      this.stats.departures += 1;
    }
    const minimum = this.environment ? 0 : this.minGuests;
    while (this.guests.length < minimum && this.spawnGuest()) {
      this.spawnClock = 0;
    }
  }

  private addInitialGuest(): void {
    const seat = this.findAvailable(SEATS);
    if (!seat) return;
    const guest = this.makeGuest('activity', seat);
    guest.seatId = seat.id;
    guest.activity = this.pickActivityFor(guest);
    guest.stateDuration = this.duration(this.random.range(guest.regularId ? 42 : 19, guest.regularId ? 58 : 34));
    this.reservations.reserve(seat.id, guest.id);
    this.guests.push(guest);
    this.applyAccessory(guest);
    this.stats.arrivals += 1;
  }

  private makeGuest(state: Guest['state'], position: Point): Guest {
    const numericId = this.nextGuestId;
    this.nextGuestId += 1;
    const regular = this.pickRegular(numericId <= REGULARS.length);
    return {
      id: `guest-${numericId}`,
      name: regular?.name ?? NAMES[(numericId - 1) % NAMES.length] as string,
      state,
      activity: regular?.favoriteActivity ?? this.random.pick(ACTIVITIES),
      position: copyPoint(position),
      target: copyPoint(position),
      facing: 1,
      speed: this.random.range(18, 23),
      stateTime: 0,
      stateDuration: 0,
      animation: this.random.range(0, Math.PI * 2),
      activityRounds: 0,
      palette: regular?.palette ?? this.random.pick(PALETTES),
      regularId: regular?.id,
    };
  }

  private pickRegular(force = false): RegularProfile | undefined {
    const available = REGULARS.filter((profile) => !this.guests.some((guest) => guest.regularId === profile.id));
    if (available.length === 0) return undefined;
    const shouldIntroduce = force || this.random.next() < 0.78;
    if (!shouldIntroduce) return undefined;

    for (let offset = 0; offset < REGULARS.length; offset += 1) {
      const index = (this.nextRegularIndex + offset) % REGULARS.length;
      const profile = REGULARS[index];
      if (!profile || !available.includes(profile)) continue;
      this.nextRegularIndex = (index + 1) % REGULARS.length;
      return profile;
    }
    return available[0];
  }

  private pickActivityFor(guest: Guest, excluding?: GuestActivity): GuestActivity {
    const regular = REGULARS.find((profile) => profile.id === guest.regularId);
    if (regular && regular.favoriteActivity !== excluding) return regular.favoriteActivity;
    return this.random.pick(ACTIVITIES.filter((activity) => activity !== excluding));
  }

  private updatePopulation(delta: number): void {
    this.spawnClock += delta;
    this.populationClock += delta;

    if (!this.environment && this.populationClock > this.duration(42)) {
      this.populationClock = 0;
      this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);
    }

    const minimum = this.environment ? 0 : this.minGuests;
    const needsGuest = this.guests.length < Math.max(minimum, this.desiredGuestCount);
    if (needsGuest && this.spawnClock > this.duration(2.4)) {
      if (this.spawnGuest()) this.spawnClock = 0;
    }
  }

  private scheduleNextAccident(): void {
    this.accidentCountdown = this.accidentRandom.range(this.accidentMinDelay, this.accidentMaxDelay);
    this.pendingAccidentKind = undefined;
  }

  private scheduleNextMoment(): void {
    this.momentCountdown = this.momentRandom.range(this.momentMinDelay, this.momentMaxDelay);
  }

  private scheduleNextStory(retrySoon = false): void {
    const minimum = retrySoon ? Math.min(42, this.storyMinDelay) : this.storyMinDelay;
    const maximum = retrySoon ? Math.min(72, this.storyMaxDelay) : this.storyMaxDelay;
    this.storyCountdown = this.storyRandom.range(minimum, Math.max(minimum, maximum));
  }

  private updateMoment(delta: number): void {
    const moment = this.currentMoment;
    if (moment) {
      moment.elapsed += delta;
      if (moment.elapsed < moment.duration) return;
      this.stats.momentsCompleted += 1;
      this.lastMomentKind = moment.kind;
      this.currentMoment = undefined;
      if (moment.story) this.finishStoryBeat(moment);
      if (this.momentEnabled) this.scheduleNextMoment();
      return;
    }

    if (this.storyEnabled && this.storyCountdown !== undefined) {
      this.storyCountdown = Math.max(0, this.storyCountdown - delta);
      if (this.storyCountdown === 0) {
        if (this.beginStoryMoment()) return;
        this.scheduleNextStory(true);
      }
    }

    if (!this.momentEnabled || this.momentCountdown === undefined) return;
    this.momentCountdown = Math.max(0, this.momentCountdown - delta);
    if (this.momentCountdown > 0) return;
    if (!this.beginMoment()) this.scheduleNextMoment();
  }

  private beginMoment(): boolean {
    const seated = this.guests.filter((guest) => guest.state === 'activity');
    const rainy = ['rain', 'snow', 'fog', 'storm'].includes(this.environment?.weather.kind ?? 'rain');
    const eligible = this.momentKinds.filter((kind) => {
      if (kind === 'shared-cake' || kind === 'card-game') return seated.length >= 2;
      if (kind === 'window-gaze') return rainy && seated.length >= 1;
      if (kind === 'first-date-toast') return this.findDatePair(seated).length === 2;
      if (kind === 'knit-gift') return this.findKnittingPair(seated).length === 2;
      return seated.length >= 1;
    });
    if (eligible.length === 0) return false;
    const fresh = eligible.filter((kind) => kind !== this.lastMomentKind);
    const kind = this.momentRandom.pick(fresh.length ? fresh : eligible);
    if (!kind) return false;

    const participants = this.pickMomentParticipants(kind, seated);
    if (participants.length === 0) return false;
    this.createMoment(kind, participants);
    return true;
  }

  private beginStoryMoment(): boolean {
    const seated = this.guests.filter((guest) => guest.state === 'activity');
    const candidates: StoryMomentCandidate[] = [];
    const mara = seated.find((guest) => guest.regularId === 'mara');
    const sketchStage = this.storyProgress.sketchbook;
    if (this.storyKinds.includes('sketchbook') && mara && sketchStage < 2) {
      candidates.push({ kind: 'sketch-reveal', story: 'sketchbook', step: (sketchStage + 1) as 1 | 2, participants: [mara] });
    }

    const datePair = this.findDatePair(seated);
    const dateStage = this.storyProgress['first-date'];
    if (this.storyKinds.includes('first-date') && datePair.length === 2 && dateStage < 2) {
      candidates.push({
        kind: dateStage === 0 ? 'shared-cake' : 'first-date-toast',
        story: 'first-date',
        step: (dateStage + 1) as 1 | 2,
        participants: datePair,
      });
    }

    const knittingPair = this.findKnittingPair(seated);
    if (this.storyKinds.includes('knit-gift') && knittingPair.length === 2 && this.storyProgress['knit-gift'] === 0) {
      candidates.push({ kind: 'knit-gift', story: 'knit-gift', step: 1, participants: knittingPair });
    }

    const candidate = candidates.length ? this.storyRandom.pick(candidates) : undefined;
    if (!candidate) return false;
    this.createMoment(candidate.kind, candidate.participants, candidate.story, candidate.step);
    return true;
  }

  private createMoment(
    kind: CafeMomentKind,
    participants: readonly Guest[],
    story?: CafeStoryKind,
    storyStep?: 1 | 2,
  ): void {
    this.currentMoment = {
      id: this.nextMomentId,
      kind,
      startedAt: this.stats.elapsed,
      participantIds: participants.map((guest) => guest.id),
      elapsed: 0,
      duration: MOMENT_DURATIONS[kind] * this.momentDurationScale,
      story,
      storyStep,
    };
    this.nextMomentId += 1;
    this.momentCountdown = undefined;
    if (story) this.storyCountdown = undefined;
  }

  private finishStoryBeat(moment: CafeMoment): void {
    const story = moment.story;
    const step = moment.storyStep;
    if (!story || !step) return;
    if (step > this.storyProgress[story]) {
      this.storyProgress[story] = step;
      this.stats.storyBeatsCompleted += 1;
      if (step >= this.storyLastStep(story)) this.stats.storiesCompleted += 1;
    }
    this.scheduleNextStory();
  }

  private storyLastStep(story: CafeStoryKind): number {
    return story === 'knit-gift' ? 1 : 2;
  }

  private pickMomentParticipants(kind: CafeMomentKind, seated: readonly Guest[]): Guest[] {
    if (kind === 'shared-cake' || kind === 'card-game') {
      const pairs: Array<readonly [Guest, Guest]> = [];
      for (let left = 0; left < seated.length; left += 1) {
        for (let right = left + 1; right < seated.length; right += 1) {
          const first = seated[left];
          const second = seated[right];
          if (first && second) pairs.push([first, second]);
        }
      }
      pairs.sort(([leftA, rightA], [leftB, rightB]) => distance(leftA.position, rightA.position) - distance(leftB.position, rightB.position));
      const nearbyPairs = pairs.slice(0, Math.min(3, pairs.length));
      return nearbyPairs.length > 0 ? [...this.momentRandom.pick(nearbyPairs)] : [];
    }
    if (kind === 'window-gaze') {
      const byWindow = [...seated].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
      return byWindow[0] ? [byWindow[0]] : [];
    }
    if (kind === 'first-date-toast') return this.findDatePair(seated);
    if (kind === 'knit-gift') return this.findKnittingPair(seated);
    const artist = seated.find((guest) => guest.activity === 'sketching') ?? this.momentRandom.pick(seated);
    return artist ? [artist] : [];
  }

  private findDatePair(seated: readonly Guest[]): Guest[] {
    const noor = seated.find((guest) => guest.regularId === 'noor');
    const toni = seated.find((guest) => guest.regularId === 'toni');
    return noor && toni ? [noor, toni] : [];
  }

  private findKnittingPair(seated: readonly Guest[]): Guest[] {
    const linn = seated.find((guest) => guest.regularId === 'linn');
    const neighbour = seated.find((guest) => guest.id !== linn?.id);
    return linn && neighbour ? [linn, neighbour] : [];
  }

  private updateAccident(delta: number): void {
    const accident = this.currentAccident;
    if (!accident) {
      if (!this.accidentEnabled || this.accidentCountdown === undefined) return;
      this.accidentCountdown = Math.max(0, this.accidentCountdown - delta);
      if (this.accidentCountdown > 0) return;
      this.pendingAccidentKind ??= this.accidentRandom.pick(this.accidentKinds);
      this.beginAccident(this.pendingAccidentKind);
      return;
    }

    accident.phaseElapsed += delta;
    if (accident.kind === 'umbrella-pop') this.updateUmbrellaAccident(accident, delta);
    if (accident.phaseElapsed < accident.phaseDuration) return;

    if (accident.phase === 'startle') {
      this.enterAccidentPhase(accident, 'chaos');
      return;
    }
    if (accident.phase === 'chaos') {
      this.enterAccidentPhase(accident, 'cleanup');
      if (accident.kind === 'tray-drop') this.barista.task = 'wiping';
      return;
    }
    this.finishAccident(accident);
  }

  private beginAccident(kind: AccidentKind): void {
    const guest = this.pickAccidentGuest(kind);
    if (!guest) return;

    this.accidentCountdown = undefined;
    this.accidentGuestSnapshot = this.snapshotGuest(guest);
    this.accidentBaristaSnapshot = kind === 'tray-drop' ? this.snapshotBarista() : undefined;

    let position = copyPoint(guest.position);
    let witnessId: string | undefined;
    let detour: Point | undefined;
    if (kind === 'tray-drop') {
      position = { x: Math.max(268, this.barista.position.x - 18), y: 160 };
      witnessId = guest.id;
      this.barista.task = 'serving';
      this.barista.taskTime = 0;
      this.barista.target = copyPoint(this.barista.position);
    } else if (kind === 'umbrella-pop') {
      const side = guest.position.y > 174 ? -1 : 1;
      detour = {
        x: Math.max(10, Math.min(374, guest.position.x + guest.facing * 5)),
        y: Math.max(145, Math.min(202, guest.position.y + side * 15)),
      };
    }

    this.currentAccident = {
      id: this.nextAccidentId,
      kind,
      phase: 'startle',
      phaseElapsed: 0,
      phaseDuration: this.accidentPhaseDuration('startle'),
      startedAt: this.stats.elapsed,
      position,
      guestId: kind === 'tray-drop' ? undefined : guest.id,
      witnessId,
      detour,
    };
    this.nextAccidentId += 1;
  }

  private pickAccidentGuest(kind: AccidentKind): Guest | undefined {
    if (kind === 'coffee-spill') {
      const seated = this.guests.filter((guest) => guest.state === 'activity');
      return seated.length ? this.accidentRandom.pick(seated) : undefined;
    }
    if (kind === 'umbrella-pop') {
      const walking = this.guests.filter((guest) => (
        guest.state.includes('walking') || guest.state === 'entering' || guest.state === 'exiting'
      ) && guest.position.x >= 8 && guest.position.x <= WORLD_WIDTH - 8);
      return walking.length ? this.accidentRandom.pick(walking) : undefined;
    }
    return [...this.guests].sort((left, right) => distance(left.position, this.barista.position) - distance(right.position, this.barista.position))[0];
  }

  private snapshotGuest(guest: Guest): GuestSnapshot {
    return {
      state: guest.state,
      activity: guest.activity,
      target: copyPoint(guest.target),
      waypoints: copyPoints(guest.waypoints),
      facing: guest.facing,
      stateTime: guest.stateTime,
      stateDuration: guest.stateDuration,
      animation: guest.animation,
      activityRounds: guest.activityRounds,
      seatId: guest.seatId,
      destinationId: guest.destinationId,
      reservedResources: this.reservations.resourcesOf(guest.id),
    };
  }

  private snapshotBarista(): BaristaSnapshot {
    return {
      position: copyPoint(this.barista.position),
      target: copyPoint(this.barista.target),
      task: this.barista.task,
      taskTime: this.barista.taskTime,
      taskDuration: this.barista.taskDuration,
      animation: this.barista.animation,
      facing: this.barista.facing,
    };
  }

  private enterAccidentPhase(accident: CafeAccident, phase: AccidentPhase): void {
    accident.phase = phase;
    accident.phaseElapsed = 0;
    accident.phaseDuration = this.accidentPhaseDuration(phase);
  }

  private updateUmbrellaAccident(accident: CafeAccident, delta: number): void {
    const guest = this.guests.find((item) => item.id === accident.guestId);
    const snapshot = this.accidentGuestSnapshot;
    if (!guest || !snapshot) return;
    if (accident.phase === 'startle') return;

    const target = accident.phase === 'chaos' ? accident.detour : snapshot.target;
    if (!target) return;
    guest.animation += delta * 5;
    this.moveGuestTowardPoint(guest, target, delta * 0.72);
  }

  private moveGuestTowardPoint(guest: Guest, target: Point, delta: number): void {
    const dx = target.x - guest.position.x;
    const dy = target.y - guest.position.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining <= 0.15) return;
    const step = Math.min(remaining, guest.speed * delta);
    const candidate = {
      x: guest.position.x + (dx / remaining) * step,
      y: guest.position.y + (dy / remaining) * step,
    };
    if (!this.canOccupy(guest, candidate)) return;
    guest.position = candidate;
    if (Math.abs(dx) > 0.2) guest.facing = dx < 0 ? -1 : 1;
  }

  private finishAccident(accident: CafeAccident): void {
    const participantId = accident.guestId ?? accident.witnessId;
    const guest = this.guests.find((item) => item.id === participantId);
    if (guest && this.accidentGuestSnapshot) this.restoreGuest(guest, this.accidentGuestSnapshot);
    if (this.accidentBaristaSnapshot) this.restoreBarista(this.accidentBaristaSnapshot);

    this.stats.accidentsCompleted += 1;
    this.currentAccident = undefined;
    this.accidentGuestSnapshot = undefined;
    this.accidentBaristaSnapshot = undefined;
    this.scheduleNextAccident();
  }

  private restoreGuest(guest: Guest, snapshot: GuestSnapshot): void {
    guest.state = snapshot.state;
    guest.activity = snapshot.activity;
    guest.target = copyPoint(snapshot.target);
    guest.waypoints = copyPoints(snapshot.waypoints);
    guest.facing = snapshot.facing;
    guest.stateTime = snapshot.stateTime;
    guest.stateDuration = snapshot.stateDuration;
    guest.animation = snapshot.animation;
    guest.activityRounds = snapshot.activityRounds;
    guest.seatId = snapshot.seatId;
    guest.destinationId = snapshot.destinationId;

    for (const resourceId of snapshot.reservedResources) {
      if (!this.reservations.ownerOf(resourceId)) this.reservations.reserve(resourceId, guest.id);
    }
  }

  private restoreBarista(snapshot: BaristaSnapshot): void {
    this.barista.position = copyPoint(snapshot.position);
    this.barista.target = copyPoint(snapshot.target);
    this.barista.task = snapshot.task;
    this.barista.taskTime = snapshot.taskTime;
    this.barista.taskDuration = snapshot.taskDuration;
    this.barista.animation = snapshot.animation;
    this.barista.facing = snapshot.facing;
  }

  private accidentPhaseDuration(phase: AccidentPhase): number {
    return ACCIDENT_PHASE_DURATIONS[phase] * this.accidentPhaseScale;
  }

  private updateGuest(guest: Guest, delta: number, departed: Guest[]): void {
    switch (guest.state) {
      case 'entering':
        if (this.moveToward(guest, delta)) {
          const place = this.placeById(guest.destinationId);
          if (place) this.transition(guest, 'queueing', place);
        }
        break;
      case 'queueing':
        this.promoteQueue(guest);
        if (this.moveToward(guest, delta) && guest.destinationId === 'queue-0') {
          guest.state = 'ordering';
          guest.stateTime = 0;
          guest.stateDuration = this.duration(this.random.range(2.7, 4.6));
          guest.facing = 1;
        }
        break;
      case 'ordering':
        if (guest.stateTime >= guest.stateDuration) this.beginWaiting(guest);
        break;
      case 'waiting':
        if (this.moveToward(guest, delta) && guest.stateTime >= guest.stateDuration && guest.seatId) {
          if (guest.destinationId) this.reservations.release(guest.destinationId, guest.id);
          const seat = this.placeById(guest.seatId);
          if (seat) this.transition(guest, 'walking-to-seat', seat);
        }
        break;
      case 'walking-to-seat':
        if (this.moveToward(guest, delta)) {
          guest.state = 'activity';
          guest.stateTime = 0;
          guest.stateDuration = this.duration(this.random.range(guest.regularId ? 38 : 20, guest.regularId ? 56 : 38));
          guest.activity = this.pickActivityFor(guest);
          guest.facing = guest.position.x < 150 ? 1 : -1;
        }
        break;
      case 'activity':
        if (guest.stateTime >= guest.stateDuration) this.finishActivity(guest);
        break;
      case 'walking-to-exit':
        if (this.moveToward(guest, delta)) {
          this.reservations.release('exit-lane', guest.id);
          this.transition(guest, 'exiting', OUTSIDE);
        }
        break;
      case 'exiting':
        if (this.moveToward(guest, delta)) departed.push(guest);
        break;
    }
  }

  private beginWaiting(guest: Guest): void {
    const seat = this.findAvailable(SEATS);
    const waitingPlace = this.findAvailable(WAIT_PLACES);
    if (!seat || !waitingPlace) {
      guest.stateDuration += this.duration(1.2);
      return;
    }

    this.reservations.reserve(seat.id, guest.id);
    this.reservations.reserve(waitingPlace.id, guest.id);
    if (guest.destinationId) this.reservations.release(guest.destinationId, guest.id);
    guest.seatId = seat.id;
    guest.state = 'waiting';
    guest.stateTime = 0;
    guest.stateDuration = this.duration(this.random.range(4.5, 7.5));
    guest.destinationId = waitingPlace.id;
    this.setGuestTarget(guest, waitingPlace);
    guest.facing = 1;
  }

  private finishActivity(guest: Guest): void {
    const regular = guest.regularId !== undefined;
    const maxRounds = regular ? 3 : 1;
    const stayChance = regular ? 0.84 : 0.58;
    if (this.guests.length <= this.desiredGuestCount && guest.activityRounds < maxRounds && this.random.next() < stayChance) {
      guest.activityRounds += 1;
      guest.activity = this.pickActivityFor(guest, guest.activity);
      guest.stateTime = 0;
      guest.stateDuration = this.duration(this.random.range(regular ? 24 : 12, regular ? 38 : 24));
      return;
    }

    if (!this.reservations.reserve('exit-lane', guest.id)) {
      guest.stateTime = 0;
      guest.stateDuration = this.duration(2);
      return;
    }
    if (guest.seatId) this.reservations.release(guest.seatId, guest.id);
    guest.seatId = undefined;
    this.transition(guest, 'walking-to-exit', ENTRANCE);
    guest.destinationId = 'exit-lane';
  }

  private promoteQueue(guest: Guest): void {
    if (guest.destinationId === 'queue-0' || distance(guest.position, guest.target) > 0.5) return;
    const currentIndex = QUEUE_PLACES.findIndex((place) => place.id === guest.destinationId);
    if (currentIndex <= 0) return;
    const closer = QUEUE_PLACES[currentIndex - 1];
    if (!closer || !this.reservations.reserve(closer.id, guest.id)) return;
    if (guest.destinationId) this.reservations.release(guest.destinationId, guest.id);
    guest.destinationId = closer.id;
    this.setGuestTarget(guest, closer);
  }

  private updateBarista(delta: number): void {
    const barista = this.barista;
    barista.taskTime += delta;
    barista.animation += delta * (distance(barista.position, barista.target) > 0.2 ? 7 : 2.4);
    const dx = barista.target.x - barista.position.x;
    const step = Math.min(Math.abs(dx), delta * 13);
    if (step > 0) {
      barista.facing = dx < 0 ? -1 : 1;
      barista.position.x += Math.sign(dx) * step;
    }

    if (barista.taskTime < this.duration(barista.taskDuration)) return;
    barista.taskTime = 0;
    const waiting = this.guests.some((guest) => guest.state === 'waiting' || guest.state === 'ordering');
    barista.task = waiting
      ? this.random.pick(['machine', 'machine', 'grinding', 'serving'] as const)
      : this.desiredGuestCount <= 2
        ? this.random.pick(['wiping', 'restocking', 'polishing', 'polishing', 'tasting'] as const)
        : this.random.pick(['machine', 'grinding', 'wiping', 'restocking'] as const);
    barista.target = copyPoint(BARISTA_PLACES[barista.task]);
    barista.taskDuration = this.random.range(6, 11);
  }

  private setGuestTarget(guest: Guest, target: Point): void {
    guest.target = copyPoint(target);
    guest.waypoints = this.planRoute(guest.position, guest.target);
  }

  private planRoute(start: Point, target: Point): Point[] {
    if (segmentIsClear(start, target)) return [];

    const columns = Math.floor((NAVIGATION_MAX_X - NAVIGATION_MIN_X) / NAVIGATION_STEP) + 1;
    const rows = Math.floor((NAVIGATION_MAX_Y - NAVIGATION_MIN_Y) / NAVIGATION_STEP) + 1;
    const pointFor = (column: number, row: number): Point => ({
      x: NAVIGATION_MIN_X + column * NAVIGATION_STEP,
      y: NAVIGATION_MIN_Y + row * NAVIGATION_STEP,
    });
    const keyFor = (column: number, row: number): string => `${column}:${row}`;
    const parseKey = (key: string): readonly [number, number] => key.split(':').map(Number) as [number, number];
    const nearestVisibleNode = (origin: Point): string | undefined => {
      const candidates: Array<{ key: string; point: Point; distance: number }> = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const point = pointFor(column, row);
          if (pointHitsCafeCollider(point) || !segmentIsClear(origin, point)) continue;
          candidates.push({ key: keyFor(column, row), point, distance: distance(origin, point) });
        }
      }
      candidates.sort((left, right) => left.distance - right.distance);
      return candidates[0]?.key;
    };

    const startKey = nearestVisibleNode(start);
    const endKey = nearestVisibleNode(target);
    if (!startKey || !endKey) return [];

    const queue = [startKey];
    const visited = new Set(queue);
    const previous = new Map<string, string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current === endKey) break;
      const [column, row] = parseKey(current);
      for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nextColumn = column + offsetX;
        const nextRow = row + offsetY;
        if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
        const nextKey = keyFor(nextColumn, nextRow);
        const nextPoint = pointFor(nextColumn, nextRow);
        if (visited.has(nextKey) || pointHitsCafeCollider(nextPoint) || !segmentIsClear(pointFor(column, row), nextPoint)) continue;
        visited.add(nextKey);
        previous.set(nextKey, current);
        queue.push(nextKey);
      }
    }
    if (!visited.has(endKey)) return [];

    const pathKeys = [endKey];
    while (pathKeys[0] !== startKey) {
      const predecessor = previous.get(pathKeys[0] ?? '');
      if (!predecessor) return [];
      pathKeys.unshift(predecessor);
    }
    return pathKeys
      .map((key) => {
        const [column, row] = parseKey(key);
        return pointFor(column, row);
      })
      .filter((point) => distance(point, start) > 0.2 && distance(point, target) > 0.2);
  }

  private canOccupy(guest: Guest, candidate: Point): boolean {
    if (pointHitsCafeCollider(candidate)) return false;
    // Draußen vor der Tür dürfen sich Gäste kurz überblenden; sonst könnte eine
    // eintretende Person den Ausgang dauerhaft versperren.
    if (guest.state === 'exiting' || candidate.x <= 0) return true;
    return !this.guests.some((other) => (
      other !== guest
      && other.state !== 'exiting'
      && distance(candidate, other.position) < (other.state === 'activity' ? GUEST_RADIUS * 1.05 : GUEST_RADIUS * 1.72)
    ));
  }

  private transition(guest: Guest, state: Guest['state'], target: Point): void {
    guest.state = state;
    guest.stateTime = 0;
    guest.stateDuration = 0;
    this.setGuestTarget(guest, target);
  }

  private moveToward(guest: Guest, delta: number): boolean {
    const waypoint = guest.waypoints?.[0];
    const target = waypoint ?? guest.target;
    const dx = target.x - guest.position.x;
    const dy = target.y - guest.position.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining <= 0.15) {
      guest.position = copyPoint(target);
      if (waypoint) {
        guest.waypoints?.shift();
        return false;
      }
      return true;
    }
    const step = Math.min(remaining, guest.speed * delta);
    const candidate = {
      x: guest.position.x + (dx / remaining) * step,
      y: guest.position.y + (dy / remaining) * step,
    };
    if (!this.canOccupy(guest, candidate)) {
      if (pointHitsCafeCollider(candidate)) {
        const reroute = this.planRoute(guest.position, guest.target);
        if (reroute.length > 0) {
          guest.waypoints = reroute;
          return false;
        }
      }
      const sideways = Math.min(2.5, step);
      const direction = Number.parseInt(guest.id.replace(/\D/g, ''), 10) % 2 === 0 ? 1 : -1;
      for (const sign of [direction, -direction]) {
        const detour = {
          x: guest.position.x + (-dy / remaining) * sideways * sign,
          y: guest.position.y + (dx / remaining) * sideways * sign,
        };
        if (!this.canOccupy(guest, detour)) continue;
        guest.position = detour;
        return false;
      }
      return false;
    }
    guest.position = candidate;
    if (Math.abs(dx) > 0.2) guest.facing = dx < 0 ? -1 : 1;
    if (step < remaining) return false;
    guest.position = copyPoint(target);
    if (waypoint) {
      guest.waypoints?.shift();
      return false;
    }
    return true;
  }

  private findAvailable(places: readonly Place[]): Place | undefined {
    const open = places.filter((place) => !this.reservations.ownerOf(place.id));
    return open.length > 0 ? this.random.pick(open) : undefined;
  }

  private placeById(placeId?: string): Place | undefined {
    return [...QUEUE_PLACES, ...WAIT_PLACES, ...SEATS].find((place) => place.id === placeId);
  }

  private duration(seconds: number): number {
    return seconds * this.durationScale;
  }

  private applyAccessory(guest: Guest): void {
    const weather = this.environment?.weather;
    if (!weather) return;
    const weatherKind = weather.transitionProgress < 0.75 ? weather.previousKind : weather.kind;
    const numericId = Number.parseInt(guest.id.replace(/\D/g, ''), 10) || 0;
    if (weatherKind === 'snow') guest.accessory = numericId % 2 === 0 ? 'scarf' : 'coat';
    else if (weatherKind === 'rain' || weatherKind === 'storm') guest.accessory = numericId % 3 === 0 ? 'umbrella' : 'coat';
    else if (weatherKind === 'clear' && weather.isDay && weather.temperature >= 16 && numericId % 2 === 0) guest.accessory = 'sunglasses';
    else guest.accessory = undefined;
  }
}
