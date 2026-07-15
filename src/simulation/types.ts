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

export type GuestBodyShape = 'slim' | 'soft' | 'broad' | 'compact' | 'angular';
export type GuestFaceShape = 'round' | 'oval' | 'square' | 'narrow';
export type GuestHairStyle = 'crop' | 'bob' | 'curls' | 'bun' | 'long' | 'undercut' | 'ponytail' | 'waves';
export type GuestOutfitStyle = 'cardigan' | 'hoodie' | 'jacket' | 'sweater' | 'overalls' | 'dress';
export type GuestPersonalDetail = 'none' | 'glasses' | 'freckles' | 'earring' | 'beard' | 'hairclip' | 'mole';
export type GuestMaturity = 'young' | 'adult' | 'older';

export interface GuestAppearance {
  body: GuestBodyShape;
  face: GuestFaceShape;
  hair: GuestHairStyle;
  outfit: GuestOutfitStyle;
  detail: GuestPersonalDetail;
  maturity: GuestMaturity;
  heightOffset: number;
  widthOffset: number;
  pattern: number;
}

export type RegularId =
  | 'mara'
  | 'noor'
  | 'toni'
  | 'linn'
  | 'bo'
  | 'cleo'
  | 'jun'
  | 'emi'
  | 'sora'
  | 'kai'
  | 'ari'
  | 'mika';

export type CafeStoryKind =
  | 'sketchbook'
  | 'first-date'
  | 'knit-gift'
  | 'arcade-rivals'
  | 'order-mixup'
  | 'noodle-mishap'
  | 'glitched-coop';

export interface GuestPalette {
  skin: string;
  hair: string;
  coat: string;
  accent: string;
  trousers: string;
  shoes: string;
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
  activitySpotId?: string;
  destinationId?: string;
  accessory?: GuestAccessory;
  palette: GuestPalette;
  appearance: GuestAppearance;
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
  | 'knit-gift'
  | 'coffee-tasting'
  | 'ramen-slurp'
  | 'arcade-duel'
  | 'arcade-high-score'
  | 'umbrella-handoff'
  | 'foam-moustache'
  | 'sugar-packet-domino'
  | 'steam-glasses'
  | 'chopstick-drop'
  | 'ticket-stream'
  | 'button-mash-sync'
  | 'pastry-restock'
  | 'table-reset'
  | 'window-rain-trace'
  | 'pencil-return'
  | 'warm-cup-offer'
  | 'doorway-greeting'
  | 'broth-lid-lift'
  | 'bowl-pass'
  | 'noren-gust'
  | 'condiment-pass'
  | 'last-gyoza-offer'
  | 'napkin-save'
  | 'attract-mode-wave'
  | 'token-hopper-refill'
  | 'cabinet-reboot'
  | 'ticket-trade'
  | 'coop-rescue'
  | 'lounge-prize-share';

export type MomentPhase = 'enter' | 'hold' | 'return';

export interface CafeMoment {
  readonly id: number;
  readonly kind: CafeMomentKind;
  readonly startedAt: number;
  readonly participantIds: readonly string[];
  elapsed: number;
  duration: number;
  phase?: MomentPhase;
  readonly story?: CafeStoryKind;
  readonly storyStep?: 1 | 2 | 3;
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
