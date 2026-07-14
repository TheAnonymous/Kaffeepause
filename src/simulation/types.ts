export interface Point {
  x: number;
  y: number;
}

export type GuestState =
  | 'entering'
  | 'queueing'
  | 'ordering'
  | 'waiting'
  | 'walking-to-seat'
  | 'activity'
  | 'walking-to-exit'
  | 'exiting';

export type GuestActivity =
  | 'reading'
  | 'typing'
  | 'talking'
  | 'drinking'
  | 'phone'
  | 'sketching'
  | 'journaling'
  | 'knitting'
  | 'board-game';

export type GuestAccessory = 'umbrella' | 'coat' | 'scarf' | 'sunglasses';

export type RegularId = 'mara' | 'noor' | 'toni' | 'linn';

export type CafeStoryKind = 'sketchbook' | 'first-date' | 'knit-gift';

export interface GuestPalette {
  skin: string;
  hair: string;
  coat: string;
  accent: string;
}

export interface Guest {
  id: string;
  name: string;
  state: GuestState;
  activity: GuestActivity;
  position: Point;
  target: Point;
  waypoints?: Point[];
  facing: -1 | 1;
  speed: number;
  stateTime: number;
  stateDuration: number;
  animation: number;
  activityRounds: number;
  seatId?: string;
  destinationId?: string;
  accessory?: GuestAccessory;
  palette: GuestPalette;
  regularId?: RegularId;
}

export type BaristaTask = 'machine' | 'serving' | 'wiping' | 'restocking' | 'polishing' | 'grinding' | 'tasting';

export interface Barista {
  position: Point;
  target: Point;
  task: BaristaTask;
  taskTime: number;
  taskDuration: number;
  animation: number;
  facing: -1 | 1;
}

export interface SimulationStats {
  arrivals: number;
  departures: number;
  elapsed: number;
  accidentsCompleted: number;
  momentsCompleted: number;
  storyBeatsCompleted: number;
  storiesCompleted: number;
}

export type CafeMomentKind =
  | 'shared-cake'
  | 'card-game'
  | 'window-gaze'
  | 'sketch-reveal'
  | 'first-date-toast'
  | 'knit-gift';

export interface CafeMoment {
  readonly id: number;
  readonly kind: CafeMomentKind;
  readonly startedAt: number;
  readonly participantIds: readonly string[];
  elapsed: number;
  duration: number;
  readonly story?: CafeStoryKind;
  readonly storyStep?: 1 | 2;
}

export type AccidentKind = 'tray-drop' | 'coffee-spill' | 'umbrella-pop';

export type AccidentPhase = 'startle' | 'chaos' | 'cleanup';

export interface CafeAccident {
  readonly id: number;
  readonly kind: AccidentKind;
  phase: AccidentPhase;
  phaseElapsed: number;
  phaseDuration: number;
  readonly startedAt: number;
  readonly position: Point;
  readonly guestId?: string;
  readonly witnessId?: string;
  readonly detour?: Point;
}
