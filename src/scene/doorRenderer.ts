import type { Guest } from '../simulation/types';
import type { VenueKind } from '../venue';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

export interface DoorVisualState {
  readonly opening: number;
  readonly active: boolean;
}

// Referenzmaßstab: eine stehende Figur ist rund 32 logische Pixel hoch.
// Der bewegliche Flügel bleibt mit 54 Pixeln klar als normale Eingangstür lesbar.
export const DOOR_PANEL = {
  x: 10,
  y: 127,
  width: 29,
  height: 54,
} as const;

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
    const width = DOOR_PANEL.width * (1 - open * 0.72);
    const depth = open * 5;
    const right = DOOR_PANEL.x + width;
    const { x, y, width: closedWidth, height } = DOOR_PANEL;

    this.rect(context, palette.frame, x, y, closedWidth, height);
    this.rect(context, palette.inside, x + 3, y + 6, 23, 45);
    this.rect(context, palette.outside, x + 4, y + 7, 21, 41);
    this.rect(context, '#1e2637', x + 4, y + 44, 21, 4);
    this.rect(context, palette.light, x + 4, y + 46, 21, this.pixel);
    if (open > 0.08) {
      this.rect(context, '#9db1bb', x + 5, y + 10, 2, 21);
      this.rect(context, '#d5cfb2', x + 8, y + 35, 13, this.pixel);
      this.rect(context, '#506578', x + 6, y + 39, 17, this.pixel);
    }

    this.polygon(context, palette.panel, [[x, y + 1], [right, y + 1 + depth], [right, y + height - 3 - depth], [x, y + height - 1]]);
    this.polygon(context, palette.panelLight, [[x + 1, y + 2], [right - 1, y + 2 + depth], [right - 1, y + 5 + depth], [x + 1, y + 5]]);
    this.polygon(context, '#593b3f', [[x + 1, y + height - 7], [right - 1, y + height - 8 - depth], [right - 1, y + height - 3 - depth], [x + 1, y + height - 2]]);
    this.rect(context, palette.light, x + 2, y + 7, this.pixel, 38);
    this.rect(context, '#3e2e35', right - 2, y + 9 + depth, this.pixel, Math.max(8, 34 - depth * 2));
    this.rect(context, '#d5a266', right - 4, y + 23 + depth * 0.5, 2, 4);
    this.rect(context, '#f4d18a', right - 3.5, y + 23.5 + depth * 0.5, this.pixel, 2);
    this.rect(context, '#d3b47a', right - 5, y + 27 + depth * 0.5, 4, 2);
    this.rect(context, palette.frame, x, y + height - 1, closedWidth, 2);
    this.rect(context, palette.light, x + 3, y + height, 19, this.pixel);
  }
}
