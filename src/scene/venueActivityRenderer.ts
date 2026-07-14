import type { Barista, Guest } from '../simulation/types';
import type { VenueKind } from '../venue';
import { SCENE_PROPORTIONS } from './proportions';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;

export interface VenueActivityState {
  readonly seated: number;
  readonly waiting: number;
  readonly drinking: number;
  readonly tables: Readonly<{
    readonly window: number;
    readonly left: number;
    readonly right: number;
  }>;
}

interface ActivityFrame {
  readonly context: CanvasRenderingContext2D;
  readonly venue: VenueKind;
  readonly time: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly barista: Barista;
  readonly state: VenueActivityState;
}

function tableFor(guest: Guest): 'window' | 'left' | 'right' | undefined {
  if (guest.state !== 'activity' || !guest.seatId) return undefined;
  if (guest.seatId.includes('window')) return 'window';
  if (guest.seatId.includes('table-a')) return 'left';
  if (guest.seatId.includes('table-b')) return 'right';
  return undefined;
}

export function calculateVenueActivityState(guests: readonly Guest[]): VenueActivityState {
  const tables = { window: 0, left: 0, right: 0 };
  let waiting = 0;
  let drinking = 0;
  for (const guest of guests) {
    if (guest.state === 'queueing' || guest.state === 'ordering' || guest.state === 'waiting') waiting += 1;
    if (guest.state === 'activity' && guest.activity === 'drinking') drinking += 1;
    const table = tableFor(guest);
    if (table) tables[table] += 1;
  }
  return {
    seated: tables.window + tables.left + tables.right,
    waiting,
    drinking,
    tables,
  };
}

// Ortsrequisiten reagieren auf denselben Simulations-Snapshot wie die Figuren.
export class VenueActivityRenderer {
  constructor(private readonly rect: Rect, private readonly pixel: number) {}

  drawCounterActivity(frame: ActivityFrame): void {
    if (frame.venue === 'cafe') this.drawCafeCounter(frame);
    else if (frame.venue === 'ramen') this.drawRamenCounter(frame);
    else this.drawArcadeScreens(frame);
  }

  drawTableActivity(frame: ActivityFrame): void {
    if (frame.venue === 'cafe') this.drawCafeTables(frame);
    else if (frame.venue === 'ramen') this.drawRamenTables(frame);
    else this.drawArcadeTables(frame);
  }

  private drawCafeCounter(frame: ActivityFrame): void {
    const { context, time, active, reducedMotion, barista, state } = frame;
    const moving = active && !reducedMotion;
    const steam = moving ? (time * 7) % 8 : 0;
    const workingMachine = barista.task === 'machine' || barista.task === 'grinding';

    if (workingMachine) {
      this.rect(context, '#2a252b', 337, 101, 10, 7);
      this.rect(context, '#9d765d', 339, 100, 6, 2);
      this.rect(context, '#d5ad6c', 340, 99, 4, this.pixel);
      this.rect(context, '#f2e2bd', 341, 108, 4, 2);
      this.rect(context, '#8a5945', 342, 110, 3, this.pixel);
      for (let index = 0; index < (barista.task === 'grinding' ? 3 : 2); index += 1) {
        this.rect(context, index % 2 ? '#d8c4a2' : '#f2e1be', 340 + index * 2, 98 - steam - index * 2, this.pixel, 2);
      }
    }

    const tickets = Math.min(3, state.waiting);
    for (let index = 0; index < tickets; index += 1) {
      const x = 290 + index * 6;
      this.rect(context, '#f0deb5', x, 110 - (index % 2), 5, 4);
      this.rect(context, '#bc7650', x + 1, 111 - (index % 2), 3, this.pixel);
      this.rect(context, '#5c7a71', x + 1, 113 - (index % 2), 2, this.pixel);
    }
  }

  private drawRamenCounter(frame: ActivityFrame): void {
    const { context, time, active, reducedMotion, barista, state } = frame;
    const moving = active && !reducedMotion;
    const steam = moving ? (time * 6) % 10 : 0;
    const serving = barista.task === 'machine' || barista.task === 'serving' || barista.task === 'tasting';

    if (serving) {
      this.rect(context, '#3a2934', 338, 106, 12, 4);
      this.rect(context, '#d35e4d', 340, 104, 8, 3);
      this.rect(context, '#f1c36f', 341, 103, 6, this.pixel);
      this.rect(context, '#f2e1c1', 342, 108, 4, this.pixel);
      for (let index = 0; index < 3; index += 1) {
        this.rect(context, index % 2 ? '#e5d6bb' : '#fff0d1', 341 + index * 2, 101 - steam - index * 2, this.pixel, 2);
      }
    }

    const bowls = Math.min(3, state.waiting);
    for (let index = 0; index < bowls; index += 1) {
      const x = 290 + index * 7;
      this.rect(context, '#efdfbe', x, 111, 6, 2);
      this.rect(context, '#c75249', x + 1, 113, 4, 2);
      this.rect(context, '#f0b863', x + 1, 111, 4, this.pixel);
    }
  }

  private drawArcadeScreens(frame: ActivityFrame): void {
    const { context, time, active, reducedMotion, state } = frame;
    const frameStep = active && !reducedMotion ? Math.floor(time * 1.3) : 0;
    const litScreens = Math.max(1, Math.min(3, state.seated || state.waiting));
    for (const [index, x] of [59, 96, 133].entries()) {
      const color = index % 2 ? '#c75aa5' : '#5ccbd0';
      const screenOn = index < litScreens;
      this.rect(context, screenOn ? color : '#243552', x + 5, 94, 19, 18);
      this.rect(context, '#142139', x + 7, 96, 15, 14);
      if (!screenOn) continue;
      const row = 99 + ((frameStep + index * 3) % 8);
      this.rect(context, '#f0dc8c', x + 9, row, 7, this.pixel);
      this.rect(context, color, x + 11 + ((frameStep + index) % 3) * 2, 104, 3, 3);
      this.rect(context, '#d6e7d2', x + 8, 108, 2, this.pixel);
    }
    if (state.waiting > 0) {
      this.rect(context, '#f1dd8f', 329, 106, 4, this.pixel);
      this.rect(context, '#c75aa5', 335, 106, 4, this.pixel);
      this.rect(context, '#5ccbd0', 341, 106, 4, this.pixel);
    }
  }

  private drawCafeTables(frame: ActivityFrame): void {
    const { context, state } = frame;
    const { dining } = SCENE_PROPORTIONS;
    this.drawCafePlace(context, 96, dining.rearSurfaceY + 3, state.tables.window, state.drinking);
    this.drawCafePlace(context, dining.frontTableCenters[0], dining.frontSurfaceY, state.tables.left, state.drinking);
    this.drawCafePlace(context, dining.frontTableCenters[1], dining.frontSurfaceY, state.tables.right, state.drinking);
  }

  private drawCafePlace(context: CanvasRenderingContext2D, x: number, y: number, occupied: number, drinking: number): void {
    if (occupied === 0) return;
    this.rect(context, '#f0dfbd', x - 3, y - 5, 5, 4);
    this.rect(context, '#fff0cd', x - 2, y - 4.5, 3, this.pixel);
    this.rect(context, '#9c6049', x - 2, y - 3, 3, this.pixel);
    this.rect(context, '#f0dfbd', x + 1, y - 3, 2, 2);
    if (occupied > 1 || drinking > 1) {
      this.rect(context, '#6c8b7a', x + 5, y - 4, 4, 3);
      this.rect(context, '#d8bb70', x + 6, y - 5, 2, this.pixel);
    }
  }

  private drawRamenTables(frame: ActivityFrame): void {
    const { context, state } = frame;
    const { dining } = SCENE_PROPORTIONS;
    this.drawRamenPlace(context, 96, dining.rearSurfaceY + 3, state.tables.window);
    this.drawRamenPlace(context, dining.frontTableCenters[0], dining.frontSurfaceY, state.tables.left);
    this.drawRamenPlace(context, dining.frontTableCenters[1], dining.frontSurfaceY, state.tables.right);
  }

  private drawRamenPlace(context: CanvasRenderingContext2D, x: number, y: number, occupied: number): void {
    if (occupied === 0) return;
    this.rect(context, '#f1dfbb', x - 4, y - 5, 8, 2);
    this.rect(context, '#c65b4d', x - 3, y - 3, 6, 3);
    this.rect(context, '#f1bd68', x - 2, y - 4, 4, this.pixel);
    this.rect(context, '#e5d9bd', x - this.pixel, y - 8, this.pixel, 3);
    if (occupied > 1) this.rect(context, '#4b3039', x + 6, y - 4, 5, this.pixel);
  }

  private drawArcadeTables(frame: ActivityFrame): void {
    const { context, state } = frame;
    const { dining } = SCENE_PROPORTIONS;
    this.drawArcadePlace(context, 96, dining.rearSurfaceY + 3, state.tables.window);
    this.drawArcadePlace(context, dining.frontTableCenters[0], dining.frontSurfaceY, state.tables.left);
    this.drawArcadePlace(context, dining.frontTableCenters[1], dining.frontSurfaceY, state.tables.right);
  }

  private drawArcadePlace(context: CanvasRenderingContext2D, x: number, y: number, occupied: number): void {
    if (occupied === 0) return;
    this.rect(context, '#17253a', x - 4, y - 5, 8, 4);
    this.rect(context, '#5bcbd0', x - 2, y - 4, 4, this.pixel);
    this.rect(context, '#c55aa5', x - 3, y - 2, 2, 2);
    this.rect(context, '#e8db8d', x + 1, y - 2, 2, 2);
    if (occupied > 1) this.rect(context, '#dbe7d0', x + 5, y - 4, 3, this.pixel);
  }
}
