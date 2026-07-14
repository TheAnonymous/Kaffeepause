import type { Guest } from '../simulation/types';
import type { VenueKind } from '../venue';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

export interface DoorVisualState {
  readonly opening: number;
  readonly active: boolean;
}

interface DoorFrame {
  readonly context: CanvasRenderingContext2D;
  readonly venue: VenueKind;
  readonly time: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly guests: readonly Guest[];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/** Gäste öffnen die Tür nur im schmalen Eingangsbereich bei x=24/y=188. */
export function doorTargetForGuests(guests: readonly Guest[]): number {
  let target = 0;
  for (const guest of guests) {
    const crossing = guest.state === 'entering' || guest.state === 'walking-to-exit' || guest.state === 'exiting';
    if (!crossing || guest.position.y < 164 || guest.position.y > 208) continue;
    const distance = Math.hypot(guest.position.x - 24, guest.position.y - 188);
    const proximity = clamp(1 - distance / 46);
    target = Math.max(target, 0.25 + proximity * 0.75);
  }
  return target;
}

// Die Tür dreht als schmales Pixel-Trapez nach innen; der Eingang bleibt derselbe Simulationskorridor.
export class DoorRenderer {
  private opening = 0;
  private lastTime = 0;

  constructor(private readonly rect: Rect, private readonly polygon: Polygon, private readonly pixel: number) {}

  draw(frame: DoorFrame): DoorVisualState {
    const target = doorTargetForGuests(frame.guests);
    const delta = frame.active ? clamp(frame.time - this.lastTime, 0, 0.1) : 0;
    this.lastTime = frame.time;
    const speed = target > this.opening ? 4.8 : 1.45;
    this.opening += Math.sign(target - this.opening) * Math.min(Math.abs(target - this.opening), delta * speed);
    if (frame.reducedMotion) this.opening = target;
    this.drawPanel(frame.context, frame.venue, this.opening);
    return { opening: this.opening, active: target > 0.02 };
  }

  private drawPanel(context: CanvasRenderingContext2D, venue: VenueKind, opening: number): void {
    const palette = venue === 'ramen'
      ? { frame: '#7f3d43', light: '#c4564b', panel: '#a94b46', panelLight: '#e3a55f', inside: '#392534', outside: '#4d3d48' }
      : venue === 'arcade'
        ? { frame: '#304968', light: '#5ccbd0', panel: '#253b59', panelLight: '#64cbd0', inside: '#152136', outside: '#293d57' }
        : { frame: '#8c5a49', light: '#d08d60', panel: '#734744', panelLight: '#9d6450', inside: '#342a34', outside: '#455369' };
    const open = clamp(opening);
    const width = 29 * (1 - open * 0.72);
    const depth = open * 5;
    const right = 10 + width;

    this.rect(context, palette.frame, 10, 127, 29, 54);
    this.rect(context, palette.inside, 13, 133, 23, 45);
    this.rect(context, palette.outside, 14, 134, 21, 41);
    this.rect(context, '#1e2637', 14, 171, 21, 4);
    this.rect(context, palette.light, 14, 173, 21, this.pixel);
    if (open > 0.08) {
      this.rect(context, '#9db1bb', 15, 137, 2, 21);
      this.rect(context, '#d5cfb2', 18, 162, 13, this.pixel);
      this.rect(context, '#506578', 16, 166, 17, this.pixel);
    }

    this.polygon(context, palette.panel, [[10, 128], [right, 128 + depth], [right, 178 - depth], [10, 180]]);
    this.polygon(context, palette.panelLight, [[11, 129], [right - 1, 129 + depth], [right - 1, 132 + depth], [11, 132]]);
    this.polygon(context, '#593b3f', [[11, 174], [right - 1, 173 - depth], [right - 1, 178 - depth], [11, 179]]);
    this.rect(context, palette.light, 12, 134, this.pixel, 38);
    this.rect(context, '#3e2e35', right - 2, 136 + depth, this.pixel, Math.max(8, 34 - depth * 2));
    this.rect(context, '#d5a266', right - 4, 150 + depth * 0.5, 2, 4);
    this.rect(context, '#f4d18a', right - 3.5, 150.5 + depth * 0.5, this.pixel, 2);
    this.rect(context, '#d3b47a', right - 5, 154 + depth * 0.5, 4, 2);
    this.rect(context, palette.frame, 10, 180, 29, 2);
    this.rect(context, palette.light, 13, 181, 19, this.pixel);
  }
}
