import {
  GUEST_RADIUS,
  VENUE_LAYOUTS,
  WORLD_WIDTH,
  activitySpotById,
  planVenueRoute,
  pointHitsVenueCollider,
  type ActivitySpot,
  type ActivitySpotTag,
  type Place,
  type VenueLayout,
} from './layout';
import { SeededRandom } from './random';
import { ReservationManager } from './reservations';
import { appearanceForGuestNumber, REGULAR_APPEARANCES } from './appearance';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { VenueKind } from '../venue';
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
  GuestAppearance,
  GuestPalette,
  Point,
  RegularId,
  SimulationStats,
} from './types';
import type { SceneSnapshot } from '../scene/types';

const NAMES = ['Fritzi', 'Eli', 'Jun', 'Pia', 'Mika', 'Romy', 'Ari', 'Bo', 'Cleo', 'Dani', 'Emi', 'Flo'] as const;
const ACTIVITIES: readonly GuestActivity[] = [
  'reading', 'typing', 'talking', 'drinking', 'phone', 'sketching', 'journaling', 'knitting', 'board-game',
];
const PALETTES: readonly GuestPalette[] = [
  { skin: '#d8a071', hair: '#3a252b', coat: '#557b78', accent: '#e5b568', trousers: '#343b46', shoes: '#171820' },
  { skin: '#8f5c48', hair: '#241c25', coat: '#a5544e', accent: '#e6c589', trousers: '#41343d', shoes: '#201b21' },
  { skin: '#edc39a', hair: '#6d4938', coat: '#5c668c', accent: '#d98f5f', trousers: '#343a55', shoes: '#26202a' },
  { skin: '#b87957', hair: '#33272a', coat: '#8a684f', accent: '#77a095', trousers: '#4e3f38', shoes: '#2d2427' },
  { skin: '#e1aa7f', hair: '#b16a46', coat: '#677348', accent: '#e2bc72', trousers: '#3d4937', shoes: '#25241f' },
  { skin: '#71483c', hair: '#191820', coat: '#6d5278', accent: '#c98668', trousers: '#403446', shoes: '#11151c' },
  { skin: '#f0c8a4', hair: '#d3a073', coat: '#8a5367', accent: '#7db0a1', trousers: '#4b4054', shoes: '#2b252c' },
  { skin: '#a66f55', hair: '#51413b', coat: '#486c83', accent: '#d49a62', trousers: '#293a4a', shoes: '#171b22' },
  { skin: '#c98d68', hair: '#202a2f', coat: '#9a7045', accent: '#c46b70', trousers: '#47423a', shoes: '#25211f' },
  { skin: '#6f4438', hair: '#734d34', coat: '#4f7c68', accent: '#d4b566', trousers: '#2d403a', shoes: '#171d1c' },
  { skin: '#e7b58f', hair: '#765667', coat: '#79628f', accent: '#d59b72', trousers: '#433b57', shoes: '#211d29' },
  { skin: '#996047', hair: '#c7b7a2', coat: '#546d63', accent: '#bd765d', trousers: '#38433f', shoes: '#1d2221' },
];

interface RegularProfile {
  id: RegularId;
  name: string;
  venue: VenueKind;
  palette: GuestPalette;
  appearance: GuestAppearance;
  favoriteActivity: GuestActivity;
}

const REGULARS: readonly RegularProfile[] = [
  { id: 'mara', name: 'Mara', venue: 'cafe', palette: { skin: '#d8a071', hair: '#2d242b', coat: '#557b78', accent: '#e5b568', trousers: '#343b46', shoes: '#171820' }, appearance: REGULAR_APPEARANCES.mara, favoriteActivity: 'sketching' },
  { id: 'noor', name: 'Noor', venue: 'cafe', palette: { skin: '#8f5c48', hair: '#241c25', coat: '#a5544e', accent: '#e6c589', trousers: '#41343d', shoes: '#201b21' }, appearance: REGULAR_APPEARANCES.noor, favoriteActivity: 'talking' },
  { id: 'toni', name: 'Toni', venue: 'cafe', palette: { skin: '#edc39a', hair: '#6d4938', coat: '#5c668c', accent: '#d98f5f', trousers: '#343a55', shoes: '#26202a' }, appearance: REGULAR_APPEARANCES.toni, favoriteActivity: 'drinking' },
  { id: 'linn', name: 'Linn', venue: 'cafe', palette: { skin: '#b87957', hair: '#33272a', coat: '#6d5278', accent: '#77a095', trousers: '#4e3f38', shoes: '#2d2427' }, appearance: REGULAR_APPEARANCES.linn, favoriteActivity: 'knitting' },
  { id: 'bo', name: 'Bo', venue: 'cafe', palette: PALETTES[6] as GuestPalette, appearance: REGULAR_APPEARANCES.bo, favoriteActivity: 'reading' },
  { id: 'cleo', name: 'Cleo', venue: 'cafe', palette: PALETTES[7] as GuestPalette, appearance: REGULAR_APPEARANCES.cleo, favoriteActivity: 'drinking' },
  { id: 'jun', name: 'Jun', venue: 'ramen', palette: PALETTES[8] as GuestPalette, appearance: REGULAR_APPEARANCES.jun, favoriteActivity: 'drinking' },
  { id: 'emi', name: 'Emi', venue: 'ramen', palette: PALETTES[9] as GuestPalette, appearance: REGULAR_APPEARANCES.emi, favoriteActivity: 'talking' },
  { id: 'sora', name: 'Sora', venue: 'arcade', palette: { skin: '#d9a27e', hair: '#27314b', coat: '#4f6f8c', accent: '#e65f9c', trousers: '#293a4a', shoes: '#171b22' }, appearance: REGULAR_APPEARANCES.sora, favoriteActivity: 'phone' },
  { id: 'kai', name: 'Kai', venue: 'arcade', palette: { skin: '#9e684f', hair: '#28202a', coat: '#76594d', accent: '#91c19b', trousers: '#47423a', shoes: '#25211f' }, appearance: REGULAR_APPEARANCES.kai, favoriteActivity: 'journaling' },
  { id: 'ari', name: 'Ari', venue: 'arcade', palette: PALETTES[10] as GuestPalette, appearance: REGULAR_APPEARANCES.ari, favoriteActivity: 'board-game' },
  { id: 'mika', name: 'Mika', venue: 'arcade', palette: PALETTES[11] as GuestPalette, appearance: REGULAR_APPEARANCES.mika, favoriteActivity: 'typing' },
];

const REGULARS_BY_VENUE: Readonly<Record<VenueKind, readonly RegularProfile[]>> = {
  cafe: REGULARS.filter((profile) => profile.venue === 'cafe'),
  ramen: REGULARS.filter((profile) => profile.venue === 'ramen'),
  arcade: REGULARS.filter((profile) => profile.venue === 'arcade'),
};

export interface CafeSimulationOptions {
  seed?: number;
  venue?: VenueKind;
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
  'shared-cake', 'card-game', 'window-gaze', 'sketch-reveal', 'coffee-tasting',
  'ramen-slurp', 'arcade-duel', 'arcade-high-score', 'umbrella-handoff',
  'foam-moustache', 'sugar-packet-domino', 'steam-glasses', 'chopstick-drop',
  'ticket-stream', 'button-mash-sync',
];
const STORY_KINDS: readonly CafeStoryKind[] = [
  'sketchbook', 'first-date', 'knit-gift', 'arcade-rivals',
  'order-mixup', 'noodle-mishap', 'glitched-coop',
];
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
  'coffee-tasting': 12,
  'ramen-slurp': 13,
  'arcade-duel': 14,
  'arcade-high-score': 10,
  'umbrella-handoff': 12,
  'foam-moustache': 9,
  'sugar-packet-domino': 12,
  'steam-glasses': 10,
  'chopstick-drop': 9,
  'ticket-stream': 14,
  'button-mash-sync': 11,
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
  activitySpotId?: string;
  destinationId?: string;
  reservedResources: readonly string[];
}

interface StoryMomentCandidate {
  kind: CafeMomentKind;
  story: CafeStoryKind;
  step: 1 | 2 | 3;
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

function frozenPoint(point: Point): Point {
  return Object.freeze({ x: point.x, y: point.y }) as Point;
}

function copyGuest(guest: Guest): Guest {
  return Object.freeze({
    ...guest,
    position: frozenPoint(guest.position),
    target: frozenPoint(guest.target),
    waypoints: guest.waypoints ? Object.freeze(guest.waypoints.map(frozenPoint)) as Point[] : undefined,
    palette: Object.freeze({ ...guest.palette }) as GuestPalette,
    appearance: Object.freeze({ ...guest.appearance }) as GuestAppearance,
  }) as Guest;
}

function copyBarista(barista: Barista): Barista {
  return Object.freeze({ ...barista, position: frozenPoint(barista.position), target: frozenPoint(barista.target) }) as Barista;
}

function copyAccident(accident: CafeAccident): CafeAccident {
  return Object.freeze({
    ...accident,
    position: frozenPoint(accident.position),
    detour: accident.detour ? frozenPoint(accident.detour) : undefined,
  }) as CafeAccident;
}

function copyMoment(moment: CafeMoment): CafeMoment {
  return Object.freeze({ ...moment, participantIds: Object.freeze([...moment.participantIds]) }) as CafeMoment;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isWetWeather(snapshot?: CafeEnvironmentSnapshot): boolean {
  return ['rain', 'snow', 'fog', 'storm'].includes(snapshot?.weather.kind ?? 'rain');
}

function isLateDay(snapshot?: CafeEnvironmentSnapshot): boolean {
  return ['dusk', 'evening', 'night'].includes(snapshot?.dayPhase ?? 'evening');
}

function isCoffeeTime(snapshot?: CafeEnvironmentSnapshot): boolean {
  return ['dawn', 'morning', 'midday', 'afternoon'].includes(snapshot?.dayPhase ?? 'afternoon');
}

export class CafeSimulation {
  readonly reservations = new ReservationManager();
  readonly guests: Guest[] = [];
  readonly barista: Barista;

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
  private initialGuests: number;
  private minGuests: number;
  private maxGuests: number;
  private readonly configuredInitialGuests?: number;
  private readonly configuredMinGuests?: number;
  private readonly configuredMaxGuests?: number;
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
  private initialized = false;
  private nextGuestId = 1;
  private readonly nextRegularIndex: Record<VenueKind, number> = { cafe: 0, ramen: 0, arcade: 0 };
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
  private readonly momentGuestSnapshots = new Map<string, GuestSnapshot>();
  private momentBaristaSnapshot?: BaristaSnapshot;
  private lastMomentKind?: CafeMomentKind;
  private nextMomentId = 1;
  private storyCountdown?: number;
  private readonly storyProgress: Record<CafeStoryKind, number> = {
    sketchbook: 0,
    'first-date': 0,
    'knit-gift': 0,
    'arcade-rivals': 0,
    'order-mixup': 0,
    'noodle-mishap': 0,
    'glitched-coop': 0,
  };
  private environment?: CafeEnvironmentSnapshot;
  private venue: VenueKind;
  private layout: VenueLayout;

  constructor(options: CafeSimulationOptions = {}) {
    this.venue = options.venue ?? 'cafe';
    this.layout = VENUE_LAYOUTS[this.venue];
    this.configuredInitialGuests = options.initialGuests;
    this.configuredMinGuests = options.minGuests;
    this.configuredMaxGuests = options.maxGuests;
    this.random = new SeededRandom(options.seed);
    this.minGuests = 0;
    this.maxGuests = 0;
    this.initialGuests = 0;
    this.applyVenueLimits();
    this.durationScale = Math.max(0.001, options.durationScale ?? 1);
    this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);
    this.barista = {
      position: copyPoint(this.layout.staffPlaces.machine),
      target: copyPoint(this.layout.staffPlaces.machine),
      task: 'machine',
      taskTime: 0,
      taskDuration: 9,
      animation: 0,
      facing: 1,
    };

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
    this.storyMinDelay = Math.max(0, storyOptions.minDelaySeconds ?? 180);
    this.storyMaxDelay = Math.max(this.storyMinDelay, storyOptions.maxDelaySeconds ?? 360);
    this.storyKinds = storyOptions.kinds?.length ? [...new Set(storyOptions.kinds)] : STORY_KINDS;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!this.initialized) {
      const initialCount = this.environment
        ? Math.min(this.initialGuests, this.desiredGuestCount, this.layout.activitySpots.length)
        : Math.min(this.initialGuests, this.layout.activitySpots.length);
      for (let index = 0; index < initialCount; index += 1) this.addInitialGuest();
      this.initialized = true;
    }
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

  getSceneSnapshot(): SceneSnapshot {
    return Object.freeze({
      venue: this.venue,
      guests: Object.freeze(this.guests.map(copyGuest)),
      barista: copyBarista(this.barista),
      accident: this.currentAccident ? copyAccident(this.currentAccident) : undefined,
      moment: this.currentMoment ? copyMoment(this.currentMoment) : undefined,
      regularIds: Object.freeze(this.guests
        .map((guest) => guest.regularId)
        .filter((regularId): regularId is RegularId => regularId !== undefined)),
      storyStages: Object.freeze({ ...this.storyProgress }),
    });
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

  setVenue(venue: VenueKind): void {
    if (this.started || venue === this.venue) return;
    this.venue = venue;
    this.layout = VENUE_LAYOUTS[venue];
    this.applyVenueLimits();
    this.desiredGuestCount = this.random.integer(this.minGuests, this.maxGuests);
    this.barista.position = copyPoint(this.layout.staffPlaces.machine);
    this.barista.target = copyPoint(this.layout.staffPlaces.machine);
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.environment = snapshot;
    this.desiredGuestCount = Math.max(0, Math.min(this.maxGuests, snapshot.targetCrowd));
    for (const guest of this.guests) this.applyAccessory(guest);
  }

  spawnGuest(): Guest | undefined {
    if (this.guests.length >= this.maxGuests) return undefined;
    const queuePlace = this.findAvailable(this.layout.queuePlaces);
    if (!queuePlace) return undefined;

    const guest = this.makeGuest('entering', this.layout.outside);
    this.setGuestTarget(guest, this.layout.entrance);
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
    for (const id of this.currentMoment?.participantIds ?? []) pausedGuests.add(id);
    let baristaPaused = Boolean(this.currentMoment);
    if (this.currentAccident?.guestId) pausedGuests.add(this.currentAccident.guestId);
    if (this.currentAccident?.witnessId) pausedGuests.add(this.currentAccident.witnessId);
    baristaPaused ||= this.currentAccident?.kind === 'tray-drop';
    this.updateAccident(delta);
    if (this.currentAccident?.guestId) pausedGuests.add(this.currentAccident.guestId);
    if (this.currentAccident?.witnessId) pausedGuests.add(this.currentAccident.witnessId);
    baristaPaused ||= this.currentAccident?.kind === 'tray-drop';
    if (!this.currentAccident) this.updateMoment(delta);
    for (const id of this.currentMoment?.participantIds ?? []) pausedGuests.add(id);
    baristaPaused ||= Boolean(this.currentMoment);
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
    const homeRegulars = REGULARS_BY_VENUE[this.venue];
    const regularsPresent = this.guests.filter((guest) => guest.regularId !== undefined).length;
    const guest = this.makeGuest('activity', this.layout.entrance, regularsPresent < homeRegulars.length);
    const activitySpot = this.findAvailableActivitySpot(guest);
    if (!activitySpot) return;
    guest.position = copyPoint(activitySpot);
    guest.target = copyPoint(activitySpot);
    guest.activitySpotId = activitySpot.id;
    guest.activity = this.pickActivityFor(guest);
    guest.facing = activitySpot.facing;
    guest.stateDuration = this.duration(this.random.range(guest.regularId ? 42 : 19, guest.regularId ? 58 : 34));
    this.reservations.reserve(activitySpot.id, guest.id);
    this.guests.push(guest);
    this.applyAccessory(guest);
    this.stats.arrivals += 1;
  }

  private makeGuest(state: Guest['state'], position: Point, forceRegular = false): Guest {
    const numericId = this.nextGuestId;
    this.nextGuestId += 1;
    const regular = this.pickRegular(forceRegular);
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
      palette: regular?.palette ?? PALETTES[(numericId - 1) % PALETTES.length] as GuestPalette,
      appearance: regular?.appearance ?? appearanceForGuestNumber(numericId),
      regularId: regular?.id,
    };
  }

  private pickRegular(force = false): RegularProfile | undefined {
    const homeRegulars = REGULARS_BY_VENUE[this.venue];
    const available = homeRegulars.filter((profile) => !this.guests.some((guest) => guest.regularId === profile.id));
    if (available.length === 0) return undefined;
    const shouldIntroduce = force || this.random.next() < 0.78;
    if (!shouldIntroduce) return undefined;

    for (let offset = 0; offset < homeRegulars.length; offset += 1) {
      const index = (this.nextRegularIndex[this.venue] + offset) % homeRegulars.length;
      const profile = homeRegulars[index];
      if (!profile || !available.includes(profile)) continue;
      this.nextRegularIndex[this.venue] = (index + 1) % homeRegulars.length;
      return profile;
    }
    return available[0];
  }

  private pickActivityFor(guest: Guest, excluding?: GuestActivity): GuestActivity {
    const spot = activitySpotById(this.layout, guest.activitySpotId);
    const allowed = spot?.activities ?? ACTIVITIES;
    const regular = REGULARS.find((profile) => profile.id === guest.regularId);
    if (regular && allowed.includes(regular.favoriteActivity) && regular.favoriteActivity !== excluding) return regular.favoriteActivity;
    const choices = allowed.filter((activity) => activity !== excluding);
    return this.random.pick(choices.length > 0 ? choices : allowed);
  }

  private findAvailableActivitySpot(guest: Guest): ActivitySpot | undefined {
    const preferredGroups: Partial<Record<RegularId, string>> = {
      mara: 'cafe-window', noor: 'cafe-table-a', toni: 'cafe-table-a', linn: 'cafe-window',
      bo: 'cafe-table-b', cleo: 'cafe-table-b', sora: 'arcade-pair-1', kai: 'arcade-pair-1',
      ari: 'arcade-pair-2', mika: 'arcade-pair-2',
    };
    const preferredTags: Partial<Record<RegularId, ActivitySpot['tags'][number]>> = {
      jun: 'counter-adjacent', emi: 'counter-adjacent',
    };
    const open = this.layout.activitySpots.filter((spot) => !this.reservations.ownerOf(spot.id));
    const group = guest.regularId ? preferredGroups[guest.regularId] : undefined;
    const grouped = group ? open.filter((spot) => spot.groupId === group) : [];
    if (grouped.length > 0) return this.random.pick(grouped);
    const tag = guest.regularId ? preferredTags[guest.regularId] : undefined;
    const tagged = tag ? open.filter((spot) => spot.tags.includes(tag)) : [];
    return this.random.pick(tagged.length > 0 ? tagged : open);
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
      this.restoreMomentParticipants();
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
    const rainy = isWetWeather(this.environment);
    const late = isLateDay(this.environment);
    const coffeeTime = isCoffeeTime(this.environment);
    const eligible = this.momentKinds.filter((kind) => {
      const spatiallyEligible = this.eligibleGuestsForMoment(kind, seated);
      if (kind === 'shared-cake' || kind === 'card-game') return spatiallyEligible.length >= 2;
      if (kind === 'window-gaze') return rainy && spatiallyEligible.length >= 1;
      if (kind === 'first-date-toast') return this.findDatePair(seated).length === 2;
      if (kind === 'knit-gift') return this.findKnittingPair(seated).length === 2;
      if (kind === 'coffee-tasting') return this.venue === 'cafe' && coffeeTime && spatiallyEligible.length >= 1;
      if (kind === 'ramen-slurp') return this.venue === 'ramen' && (late || rainy) && spatiallyEligible.length >= 1;
      if (kind === 'arcade-duel') return this.venue === 'arcade' && spatiallyEligible.length >= 2;
      if (kind === 'arcade-high-score') return this.venue === 'arcade' && (late || spatiallyEligible.some((guest) => guest.activity === 'phone')) && spatiallyEligible.length >= 1;
      if (kind === 'umbrella-handoff') return rainy && seated.length >= 2;
      if (kind === 'foam-moustache') return this.venue === 'cafe' && spatiallyEligible.length >= 1;
      if (kind === 'sugar-packet-domino') return this.venue === 'cafe' && spatiallyEligible.length >= 2;
      if (kind === 'steam-glasses') return this.venue === 'ramen' && spatiallyEligible.length >= 1;
      if (kind === 'chopstick-drop') return this.venue === 'ramen' && spatiallyEligible.length >= 1;
      if (kind === 'ticket-stream') return this.venue === 'arcade' && spatiallyEligible.length >= 1;
      if (kind === 'button-mash-sync') return this.venue === 'arcade' && spatiallyEligible.length >= 2;
      return spatiallyEligible.length >= 1;
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

    const rivals = this.findArcadeRivals(seated);
    const rivalsStage = this.storyProgress['arcade-rivals'];
    if (this.venue === 'arcade' && this.storyKinds.includes('arcade-rivals') && rivals.length === 2 && rivalsStage < 2) {
      candidates.push({
        kind: rivalsStage === 0 ? 'arcade-duel' : 'arcade-high-score',
        story: 'arcade-rivals',
        step: (rivalsStage + 1) as 1 | 2,
        participants: rivals,
      });
    }

    const mixupPair = this.findRegularPair(seated, 'bo', 'cleo');
    const mixupStage = this.storyProgress['order-mixup'];
    if (this.venue === 'cafe' && this.storyKinds.includes('order-mixup') && mixupPair.length === 2 && mixupStage < 3) {
      const kinds = ['coffee-tasting', 'shared-cake', 'first-date-toast'] as const;
      candidates.push({
        kind: kinds[mixupStage] ?? 'first-date-toast',
        story: 'order-mixup',
        step: (mixupStage + 1) as 1 | 2 | 3,
        participants: mixupPair,
      });
    }

    const noodlePair = this.findRegularPair(seated, 'jun', 'emi');
    const noodleStage = this.storyProgress['noodle-mishap'];
    if (this.venue === 'ramen' && this.storyKinds.includes('noodle-mishap') && noodlePair.length === 2 && noodleStage < 3) {
      const kinds = ['ramen-slurp', 'chopstick-drop', 'steam-glasses'] as const;
      candidates.push({
        kind: kinds[noodleStage] ?? 'steam-glasses',
        story: 'noodle-mishap',
        step: (noodleStage + 1) as 1 | 2 | 3,
        participants: noodlePair,
      });
    }

    const coopPair = this.findRegularPair(seated, 'ari', 'mika');
    const coopStage = this.storyProgress['glitched-coop'];
    if (this.venue === 'arcade' && this.storyKinds.includes('glitched-coop') && coopPair.length === 2 && coopStage < 3) {
      const kinds = ['arcade-duel', 'button-mash-sync', 'arcade-high-score'] as const;
      candidates.push({
        kind: kinds[coopStage] ?? 'arcade-high-score',
        story: 'glitched-coop',
        step: (coopStage + 1) as 1 | 2 | 3,
        participants: coopPair,
      });
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
    storyStep?: 1 | 2 | 3,
  ): void {
    this.momentGuestSnapshots.clear();
    for (const participant of participants) this.momentGuestSnapshots.set(participant.id, this.snapshotGuest(participant));
    this.momentBaristaSnapshot = this.snapshotBarista();
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
    if (story === 'knit-gift') return 1;
    if (story === 'order-mixup' || story === 'noodle-mishap' || story === 'glitched-coop') return 3;
    return 2;
  }

  private momentTag(kind: CafeMomentKind): ActivitySpotTag | undefined {
    if (kind === 'window-gaze' || kind === 'sketch-reveal') return 'window';
    if (kind === 'shared-cake' || kind === 'card-game' || kind === 'first-date-toast'
      || kind === 'coffee-tasting' || kind === 'foam-moustache' || kind === 'sugar-packet-domino') return 'table-pair';
    if (kind === 'ramen-slurp' || kind === 'steam-glasses' || kind === 'chopstick-drop') return 'counter-adjacent';
    if (kind === 'arcade-duel' || kind === 'arcade-high-score' || kind === 'ticket-stream'
      || kind === 'button-mash-sync') return 'cabinet-pair';
    return undefined;
  }

  private eligibleGuestsForMoment(kind: CafeMomentKind, guests: readonly Guest[]): Guest[] {
    const tag = this.momentTag(kind);
    return tag ? guests.filter((guest) => this.guestHasTag(guest, tag)) : [...guests];
  }

  private guestHasTag(guest: Guest, tag: ActivitySpotTag): boolean {
    return activitySpotById(this.layout, guest.activitySpotId)?.tags.includes(tag) ?? false;
  }

  private sameActivityGroup(first: Guest, second: Guest): boolean {
    const firstGroup = activitySpotById(this.layout, first.activitySpotId)?.groupId;
    const secondGroup = activitySpotById(this.layout, second.activitySpotId)?.groupId;
    return Boolean(firstGroup && firstGroup === secondGroup);
  }

  private pickMomentParticipants(kind: CafeMomentKind, seated: readonly Guest[]): Guest[] {
    const eligible = this.eligibleGuestsForMoment(kind, seated);
    if (kind === 'shared-cake' || kind === 'card-game' || kind === 'arcade-duel' || kind === 'umbrella-handoff'
      || kind === 'sugar-packet-domino' || kind === 'button-mash-sync') {
      if (kind === 'arcade-duel') {
        const rivals = this.findArcadeRivals(seated);
        if (rivals.length === 2) return rivals;
      }
      const pairs: Array<readonly [Guest, Guest]> = [];
      for (let left = 0; left < eligible.length; left += 1) {
        for (let right = left + 1; right < eligible.length; right += 1) {
          const first = eligible[left];
          const second = eligible[right];
          if (first && second && (kind === 'umbrella-handoff' || this.sameActivityGroup(first, second))) pairs.push([first, second]);
        }
      }
      pairs.sort(([leftA, rightA], [leftB, rightB]) => distance(leftA.position, rightA.position) - distance(leftB.position, rightB.position));
      const nearbyPairs = pairs.slice(0, Math.min(3, pairs.length));
      return nearbyPairs.length > 0 ? [...this.momentRandom.pick(nearbyPairs)] : [];
    }
    if (kind === 'window-gaze') {
      const byWindow = [...eligible].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
      return byWindow[0] ? [byWindow[0]] : [];
    }
    if (kind === 'first-date-toast') return this.findDatePair(seated);
    if (kind === 'knit-gift') return this.findKnittingPair(seated);
    if (kind === 'ramen-slurp') {
      const jun = eligible.find((guest) => guest.regularId === 'jun');
      return jun ? [jun] : [eligible.find((guest) => guest.activity === 'drinking') ?? this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    if (kind === 'arcade-high-score') {
      const sora = eligible.find((guest) => guest.regularId === 'sora');
      return sora ? [sora] : [eligible.find((guest) => guest.activity === 'phone') ?? this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    if (kind === 'coffee-tasting') {
      const coffeeFan = eligible.find((guest) => guest.activity === 'drinking');
      return coffeeFan ? [coffeeFan] : [this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    if (kind === 'foam-moustache') {
      const cleo = eligible.find((guest) => guest.regularId === 'cleo');
      return [cleo ?? eligible.find((guest) => guest.activity === 'drinking') ?? this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    if (kind === 'steam-glasses') {
      const glasses = eligible.find((guest) => guest.appearance.detail === 'glasses');
      return [glasses ?? this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    if (kind === 'chopstick-drop' || kind === 'ticket-stream') {
      return [this.momentRandom.pick(eligible)].filter(Boolean) as Guest[];
    }
    const artist = eligible.find((guest) => guest.activity === 'sketching') ?? this.momentRandom.pick(eligible);
    return artist ? [artist] : [];
  }

  private findDatePair(seated: readonly Guest[]): Guest[] {
    const noor = seated.find((guest) => guest.regularId === 'noor');
    const toni = seated.find((guest) => guest.regularId === 'toni');
    return noor && toni && this.sameActivityGroup(noor, toni) ? [noor, toni] : [];
  }

  private findKnittingPair(seated: readonly Guest[]): Guest[] {
    const linn = seated.find((guest) => guest.regularId === 'linn');
    const neighbour = seated.find((guest) => guest.id !== linn?.id && linn && this.sameActivityGroup(linn, guest));
    return linn && neighbour ? [linn, neighbour] : [];
  }

  private findArcadeRivals(seated: readonly Guest[]): Guest[] {
    const sora = seated.find((guest) => guest.regularId === 'sora');
    const kai = seated.find((guest) => guest.regularId === 'kai');
    return sora && kai && this.sameActivityGroup(sora, kai) ? [sora, kai] : [];
  }

  private findRegularPair(seated: readonly Guest[], firstId: RegularId, secondId: RegularId): Guest[] {
    const first = seated.find((guest) => guest.regularId === firstId);
    const second = seated.find((guest) => guest.regularId === secondId);
    return first && second && this.sameActivityGroup(first, second) ? [first, second] : [];
  }

  private restoreMomentParticipants(): void {
    for (const [guestId, snapshot] of this.momentGuestSnapshots) {
      const guest = this.guests.find((entry) => entry.id === guestId);
      if (guest) this.restoreGuest(guest, snapshot);
    }
    if (this.momentBaristaSnapshot) this.restoreBarista(this.momentBaristaSnapshot);
    this.momentGuestSnapshots.clear();
    this.momentBaristaSnapshot = undefined;
  }

  private updateAccident(delta: number): void {
    const accident = this.currentAccident;
    if (!accident) {
      if (this.currentMoment) return;
      if (!this.accidentEnabled || this.accidentCountdown === undefined) return;
      this.accidentCountdown = Math.max(0, this.accidentCountdown - delta);
      if (this.accidentCountdown > 0) return;
      this.pendingAccidentKind ??= this.accidentRandom.pick(this.accidentKinds);
      this.beginAccident(this.pendingAccidentKind);
      return;
    }

    accident.phaseElapsed += delta;
    if (accident.phaseElapsed < accident.phaseDuration) return;

    if (accident.phase === 'startle') {
      this.enterAccidentPhase(accident, 'chaos');
      return;
    }
    if (accident.phase === 'chaos') {
      this.enterAccidentPhase(accident, 'cleanup');
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
      activitySpotId: guest.activitySpotId,
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
    guest.activitySpotId = snapshot.activitySpotId;
    guest.destinationId = snapshot.destinationId;

    this.reservations.releaseAll(guest.id);
    for (const resourceId of snapshot.reservedResources) this.reservations.reserve(resourceId, guest.id);
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
        if (this.moveToward(guest, delta) && guest.destinationId === this.layout.queuePlaces[0]?.id) {
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
        if (this.moveToward(guest, delta) && guest.stateTime >= guest.stateDuration && guest.activitySpotId) {
          if (guest.destinationId) this.reservations.release(guest.destinationId, guest.id);
          const activitySpot = this.placeById(guest.activitySpotId);
          if (activitySpot) this.transition(guest, 'walking-to-seat', activitySpot);
        }
        break;
      case 'walking-to-seat':
        if (this.moveToward(guest, delta)) {
          guest.state = 'activity';
          guest.stateTime = 0;
          guest.stateDuration = this.duration(this.random.range(guest.regularId ? 38 : 20, guest.regularId ? 56 : 38));
          guest.activity = this.pickActivityFor(guest);
          guest.facing = activitySpotById(this.layout, guest.activitySpotId)?.facing ?? guest.facing;
        }
        break;
      case 'activity':
        if (guest.stateTime >= guest.stateDuration) this.finishActivity(guest);
        break;
      case 'walking-to-exit':
        if (this.moveToward(guest, delta)) {
          this.reservations.release('exit-lane', guest.id);
          this.transition(guest, 'exiting', this.layout.outside);
        }
        break;
      case 'exiting':
        if (this.moveToward(guest, delta)) departed.push(guest);
        break;
    }
  }

  private beginWaiting(guest: Guest): void {
    const activitySpot = this.findAvailableActivitySpot(guest);
    const waitingPlace = this.findAvailable(this.layout.waitPlaces);
    if (!activitySpot || !waitingPlace) {
      guest.stateDuration += this.duration(1.2);
      return;
    }

    this.reservations.reserve(activitySpot.id, guest.id);
    this.reservations.reserve(waitingPlace.id, guest.id);
    if (guest.destinationId) this.reservations.release(guest.destinationId, guest.id);
    guest.activitySpotId = activitySpot.id;
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
    if (guest.activitySpotId) this.reservations.release(guest.activitySpotId, guest.id);
    guest.activitySpotId = undefined;
    this.transition(guest, 'walking-to-exit', this.layout.entrance);
    guest.destinationId = 'exit-lane';
  }

  private promoteQueue(guest: Guest): void {
    if (guest.destinationId === this.layout.queuePlaces[0]?.id || distance(guest.position, guest.target) > 0.5) return;
    const currentIndex = this.layout.queuePlaces.findIndex((place) => place.id === guest.destinationId);
    if (currentIndex <= 0) return;
    const closer = this.layout.queuePlaces[currentIndex - 1];
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
    barista.target = copyPoint(this.layout.staffPlaces[barista.task]);
    barista.taskDuration = this.random.range(6, 11);
  }

  private setGuestTarget(guest: Guest, target: Point): void {
    guest.target = copyPoint(target);
    guest.waypoints = this.planRoute(guest.position, guest.target);
  }

  private planRoute(start: Point, target: Point): Point[] {
    return planVenueRoute(this.layout, start, target);
  }

  private canOccupy(guest: Guest, candidate: Point): boolean {
    if (pointHitsVenueCollider(this.layout, candidate)) return false;
    // Draußen vor der Tür dürfen sich Gäste kurz überblenden; sonst könnte eine
    // eintretende Person den Ausgang dauerhaft versperren.
    if (guest.state === 'exiting' || this.isOutside(candidate)) return true;
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
      if (pointHitsVenueCollider(this.layout, candidate)) {
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

  private findAvailable<T extends Place>(places: readonly T[]): T | undefined {
    const open = places.filter((place) => !this.reservations.ownerOf(place.id));
    return open.length > 0 ? this.random.pick(open) : undefined;
  }

  private placeById(placeId?: string): Place | undefined {
    return [...this.layout.queuePlaces, ...this.layout.waitPlaces, ...this.layout.activitySpots]
      .find((place) => place.id === placeId);
  }

  private isOutside(point: Point): boolean {
    if (this.layout.entryFlow === 'left') return point.x <= 0;
    if (this.layout.entryFlow === 'right') return point.x >= WORLD_WIDTH;
    return point.y <= 126;
  }

  private applyVenueLimits(): void {
    const capacity = this.layout.activitySpots.length;
    this.minGuests = Math.max(0, Math.min(capacity, this.configuredMinGuests ?? this.layout.population.min));
    this.maxGuests = Math.max(this.minGuests, Math.min(capacity, this.configuredMaxGuests ?? this.layout.population.max));
    this.initialGuests = Math.max(0, Math.min(this.maxGuests, this.configuredInitialGuests ?? this.layout.population.min));
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
