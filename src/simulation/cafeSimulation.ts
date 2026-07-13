import { BARISTA_PLACES, ENTRANCE, OUTSIDE, QUEUE_PLACES, SEATS, WAIT_PLACES, type Place } from './layout';
import { SeededRandom } from './random';
import { ReservationManager } from './reservations';
import type { Barista, Guest, GuestActivity, GuestPalette, Point, SimulationStats } from './types';

const NAMES = ['Mara', 'Noor', 'Fritzi', 'Eli', 'Jun', 'Pia', 'Mika', 'Linn', 'Toni', 'Romy'] as const;
const ACTIVITIES: readonly GuestActivity[] = ['reading', 'typing', 'talking', 'drinking'];
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

  readonly stats: SimulationStats = { arrivals: 0, departures: 0, elapsed: 0 };

  private readonly random: SeededRandom;
  private readonly initialGuests: number;
  private readonly minGuests: number;
  private readonly maxGuests: number;
  private readonly durationScale: number;
  private started = false;
  private nextGuestId = 1;
  private spawnClock = 0;
  private populationClock = 0;
  private desiredGuestCount: number;

  constructor(options: CafeSimulationOptions = {}) {
    this.random = new SeededRandom(options.seed);
    this.minGuests = Math.max(0, Math.min(SEATS.length, options.minGuests ?? 4));
    this.maxGuests = Math.max(this.minGuests, Math.min(SEATS.length, options.maxGuests ?? 6));
    this.initialGuests = Math.max(0, Math.min(this.maxGuests, options.initialGuests ?? 4));
    this.durationScale = Math.max(0.001, options.durationScale ?? 1);
    this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (let index = 0; index < this.initialGuests; index += 1) this.addInitialGuest();
  }

  stop(): void {
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
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
    this.stats.arrivals += 1;
    return guest;
  }

  update(deltaSeconds: number): void {
    if (!this.started) return;
    const delta = Math.min(0.1, Math.max(0, deltaSeconds));
    this.stats.elapsed += delta;
    this.updatePopulation(delta);
    this.updateBarista(delta);

    const departed: Guest[] = [];
    for (const guest of this.guests) {
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
    while (this.guests.length < this.minGuests && this.spawnGuest()) {
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

    if (this.populationClock > this.duration(42)) {
      this.populationClock = 0;
      this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);
    }

    const needsGuest = this.guests.length < Math.max(this.minGuests, this.desiredGuestCount);
    if (needsGuest && this.spawnClock > this.duration(2.4)) {
      if (this.spawnGuest()) this.spawnClock = 0;
    }
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
    if (guest.activityRounds < 1 && this.random.next() < 0.58) {
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
      ? this.random.pick(['machine', 'serving'] as const)
      : this.random.pick(['machine', 'wiping'] as const);
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
}
