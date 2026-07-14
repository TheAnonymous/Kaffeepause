import { BARISTA_PLACES, ENTRANCE, OUTSIDE, QUEUE_PLACES, SEATS, WAIT_PLACES, WORLD_WIDTH, type Place } from './layout';
import { SeededRandom } from './random';
import { ReservationManager } from './reservations';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type {
  AccidentKind,
  AccidentPhase,
  Barista,
  CafeAccident,
  Guest,
  GuestActivity,
  GuestPalette,
  Point,
  SimulationStats,
} from './types';

const NAMES = ['Mara', 'Noor', 'Fritzi', 'Eli', 'Jun', 'Pia', 'Mika', 'Linn', 'Toni', 'Romy'] as const;
const ACTIVITIES: readonly GuestActivity[] = ['reading', 'typing', 'talking', 'drinking', 'phone', 'sketching'];
const PALETTES: readonly GuestPalette[] = [
  { skin: '#d8a071', hair: '#3a252b', coat: '#557b78', accent: '#e5b568' },
  { skin: '#8f5c48', hair: '#241c25', coat: '#a5544e', accent: '#e6c589' },
  { skin: '#edc39a', hair: '#6d4938', coat: '#5c668c', accent: '#d98f5f' },
  { skin: '#b87957', hair: '#33272a', coat: '#8a684f', accent: '#77a095' },
  { skin: '#e1aa7f', hair: '#b16a46', coat: '#677348', accent: '#e2bc72' },
  { skin: '#71483c', hair: '#191820', coat: '#6d5278', accent: '#c98668' },
];

export interface CafeSimulationOptions {
  seed?: number;
  initialGuests?: number;
  minGuests?: number;
  maxGuests?: number;
  durationScale?: number;
  accidents?: CafeAccidentOptions | false;
}

export interface CafeAccidentOptions {
  enabled?: boolean;
  seed?: number;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  kinds?: readonly AccidentKind[];
  phaseDurationScale?: number;
}

const ACCIDENT_KINDS: readonly AccidentKind[] = ['tray-drop', 'coffee-spill', 'umbrella-pop'];
const ACCIDENT_PHASE_DURATIONS: Readonly<Record<AccidentPhase, number>> = {
  startle: 0.9,
  chaos: 1.8,
  cleanup: 2.6,
};

interface GuestSnapshot {
  state: Guest['state'];
  activity: GuestActivity;
  target: Point;
  facing: Guest['facing'];
  stateTime: number;
  stateDuration: number;
  animation: number;
  activityRounds: number;
  seatId?: string;
  destinationId?: string;
  reservedResources: readonly string[];
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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

  readonly stats: SimulationStats = { arrivals: 0, departures: 0, elapsed: 0, accidentsCompleted: 0 };

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
  private started = false;
  private nextGuestId = 1;
  private spawnClock = 0;
  private populationClock = 0;
  private desiredGuestCount: number;
  private accidentCountdown?: number;
  private pendingAccidentKind?: AccidentKind;
  private currentAccident?: CafeAccident;
  private accidentGuestSnapshot?: GuestSnapshot;
  private accidentBaristaSnapshot?: BaristaSnapshot;
  private nextAccidentId = 1;
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
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const initialCount = this.environment
      ? Math.min(this.initialGuests, this.desiredGuestCount, SEATS.length)
      : Math.min(this.initialGuests, SEATS.length);
    for (let index = 0; index < initialCount; index += 1) this.addInitialGuest();
    if (this.accidentEnabled && this.accidentCountdown === undefined) this.scheduleNextAccident();
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

  getSecondsUntilNextAccident(): number | undefined {
    return this.currentAccident ? undefined : this.accidentCountdown;
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
    guest.target = copyPoint(ENTRANCE);
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
    this.updatePopulation(delta);
    if (!baristaPaused) this.updateBarista(delta);

    const departed: Guest[] = [];
    for (const guest of this.guests) {
      if (pausedGuests.has(guest.id)) continue;
      guest.stateTime += delta;
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
    guest.activity = this.random.pick(ACTIVITIES);
    guest.stateDuration = this.duration(this.random.range(19, 34));
    this.reservations.reserve(seat.id, guest.id);
    this.guests.push(guest);
    this.applyAccessory(guest);
    this.stats.arrivals += 1;
  }

  private makeGuest(state: Guest['state'], position: Point): Guest {
    const numericId = this.nextGuestId;
    this.nextGuestId += 1;
    return {
      id: `guest-${numericId}`,
      name: NAMES[(numericId - 1) % NAMES.length] as string,
      state,
      activity: this.random.pick(ACTIVITIES),
      position: copyPoint(position),
      target: copyPoint(position),
      facing: 1,
      speed: this.random.range(18, 23),
      stateTime: 0,
      stateDuration: 0,
      animation: this.random.range(0, Math.PI * 2),
      activityRounds: 0,
      palette: this.random.pick(PALETTES),
    };
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
    guest.position.x += (dx / remaining) * step;
    guest.position.y += (dy / remaining) * step;
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
          guest.stateDuration = this.duration(this.random.range(20, 38));
          guest.activity = this.random.pick(ACTIVITIES);
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
    guest.target = copyPoint(waitingPlace);
    guest.facing = 1;
  }

  private finishActivity(guest: Guest): void {
    if (this.guests.length <= this.desiredGuestCount && guest.activityRounds < 1 && this.random.next() < 0.58) {
      guest.activityRounds += 1;
      guest.activity = this.random.pick(ACTIVITIES.filter((activity) => activity !== guest.activity));
      guest.stateTime = 0;
      guest.stateDuration = this.duration(this.random.range(12, 24));
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
    guest.target = copyPoint(closer);
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
      ? this.random.pick(['machine', 'machine', 'serving'] as const)
      : this.desiredGuestCount <= 2
        ? this.random.pick(['wiping', 'restocking', 'polishing', 'polishing'] as const)
        : this.random.pick(['machine', 'wiping', 'restocking'] as const);
    barista.target = copyPoint(BARISTA_PLACES[barista.task]);
    barista.taskDuration = this.random.range(6, 11);
  }

  private transition(guest: Guest, state: Guest['state'], target: Point): void {
    guest.state = state;
    guest.stateTime = 0;
    guest.stateDuration = 0;
    guest.target = copyPoint(target);
  }

  private moveToward(guest: Guest, delta: number): boolean {
    const dx = guest.target.x - guest.position.x;
    const dy = guest.target.y - guest.position.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining <= 0.15) {
      guest.position = copyPoint(guest.target);
      return true;
    }
    const step = Math.min(remaining, guest.speed * delta);
    guest.position.x += (dx / remaining) * step;
    guest.position.y += (dy / remaining) * step;
    if (Math.abs(dx) > 0.2) guest.facing = dx < 0 ? -1 : 1;
    return step >= remaining;
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
