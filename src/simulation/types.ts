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

export type GuestActivity = 'reading' | 'typing' | 'talking' | 'drinking' | 'phone' | 'sketching';

export type GuestAccessory = 'umbrella' | 'coat' | 'scarf' | 'sunglasses';

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
}

export type BaristaTask = 'machine' | 'serving' | 'wiping' | 'restocking' | 'polishing';

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
