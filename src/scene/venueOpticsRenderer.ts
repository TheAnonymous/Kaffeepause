import type { VenueKind } from '../venue';
import type { SceneLighting } from './lightingRenderer';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

export interface VenueOptics {
  readonly glow: string;
  readonly sign: string;
  readonly reflection: string;
  readonly foreground: string;
}

interface OpticsFrame {
  readonly context: CanvasRenderingContext2D;
  readonly venue: VenueKind;
  readonly time: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly lighting: SceneLighting;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function opticsForVenue(venue: VenueKind): VenueOptics {
  if (venue === 'ramen') return { glow: '#f0b664', sign: '#c9514c', reflection: '#e3a35e', foreground: '#4e2d39' };
  if (venue === 'arcade') return { glow: '#5ccbd0', sign: '#c55ba5', reflection: '#70d9d2', foreground: '#172840' };
  return { glow: '#efba70', sign: '#9c654f', reflection: '#dba265', foreground: '#4a3439' };
}

// Scharfe, sparsame Pixel-Lichtflächen geben den Orten Tiefe, ohne einen weichen Filter über die Szene zu legen.
export class VenueOpticsRenderer {
  constructor(private readonly rect: Rect, private readonly polygon: Polygon, private readonly pixel: number) {}

  drawWindowAtmosphere(frame: OpticsFrame): void {
    const { context, venue, time, active, reducedMotion, lighting } = frame;
    const optics = opticsForVenue(venue);
    const strength = clamp(0.08 + lighting.night * 0.42 + lighting.wetness * 0.13);
    const shimmer = active && !reducedMotion ? Math.sin(time * 1.2) * this.pixel : 0;

    context.save();
    context.globalAlpha = strength;
    const signX = venue === 'cafe' ? [72, 200] : venue === 'ramen' ? [83, 186] : [70, 174];
    for (const x of signX) {
      this.rect(context, '#1f283a', x - 2, 76, 19, 8);
      this.rect(context, optics.sign, x, 77 + shimmer, 15, 4);
      this.rect(context, optics.glow, x + 3, 78 + shimmer, 9, this.pixel);
      this.rect(context, optics.reflection, x + 6, 82 + shimmer, 3, this.pixel);
    }
    for (let index = 0; index < 8; index += 1) {
      const x = 58 + index * 24;
      const y = 63 + ((index * 13) % 22);
      this.rect(context, index % 2 ? optics.glow : optics.sign, x, y, this.pixel, 1 + (index % 3));
    }
    context.restore();

    // Spiegelungen der Innenbeleuchtung bleiben als wenige harte Striche im Glas lesbar.
    context.save();
    context.globalAlpha = 0.045 + lighting.night * 0.095 + lighting.wetness * 0.035;
    for (const x of [72, 139, 207]) {
      this.polygon(context, optics.glow, [[x - 4, 27], [x + 4, 27], [x + 31, 99], [x + 25, 99]]);
      this.rect(context, '#fff2bf', x + 1, 33, this.pixel, 18);
    }
    context.restore();
  }

  drawFloorLight(frame: OpticsFrame): void {
    const { context, venue, time, active, reducedMotion, lighting } = frame;
    const optics = opticsForVenue(venue);
    const strength = 0.025 + lighting.night * 0.075 + lighting.wetness * 0.09;
    const ripple = active && !reducedMotion ? Math.sin(time * 1.05) * this.pixel : 0;
    const centers = venue === 'ramen' ? [76, 146, 216] : venue === 'arcade' ? [74, 146, 218] : [78, 150, 224];

    context.save();
    context.globalAlpha = strength;
    for (const x of centers) {
      this.polygon(context, optics.reflection, [[x - 7, 136], [x + 7, 136], [x + 25, 204], [x - 25, 204]]);
      this.rect(context, optics.glow, x - 5, 179 + ripple, 10, this.pixel);
      this.rect(context, '#f7d992', x - 2, 190 - ripple, 5, this.pixel);
    }
    context.restore();

    if (lighting.wetness < 0.12) return;
    context.save();
    context.globalAlpha = 0.06 + lighting.wetness * 0.1;
    for (let index = 0; index < 9; index += 1) {
      const x = 58 + index * 21;
      const width = 6 + (index % 3) * 3;
      this.rect(context, optics.reflection, x, 202 + (index % 2) + ripple, width, this.pixel);
    }
    context.restore();
  }

  drawForegroundProps(frame: OpticsFrame): void {
    const { context, venue, time, active, reducedMotion } = frame;
    const optics = opticsForVenue(venue);
    const sway = active && !reducedMotion ? Math.sin(time * 0.8) * this.pixel * 2 : 0;

    if (venue === 'cafe') {
      this.rect(context, '#27212a', 0, 190, 21, 21);
      this.rect(context, optics.foreground, 3, 192, 15, 17);
      this.rect(context, '#81564a', 4, 193, 13, this.pixel);
      this.rect(context, '#416150', 7 + sway, 181, 5, 13);
      this.rect(context, '#6f9069', 2 + sway, 184, 8, 6);
      this.rect(context, '#88a978', 11 + sway, 178, 7, 8);
      this.rect(context, '#322831', 238, 196, 25, 15);
      this.rect(context, '#7d544a', 240, 194, 21, 5);
      this.rect(context, '#bc825c', 243, 195, 15, this.pixel);
      return;
    }

    if (venue === 'ramen') {
      this.rect(context, '#281b29', 0, 181, 20, 30);
      this.rect(context, '#713440', 3, 180, 13, 27);
      this.rect(context, '#ca5149', 4, 181, 11, this.pixel);
      for (let y = 187; y < 204; y += 6) this.rect(context, '#e8aa61', 7, y + sway, 5, this.pixel);
      this.rect(context, '#392432', 238, 197, 26, 14);
      this.rect(context, optics.foreground, 240, 195, 22, 5);
      this.rect(context, '#ecae63', 243, 196, 16, this.pixel);
      return;
    }

    this.rect(context, '#0d1422', 0, 180, 22, 31);
    this.rect(context, '#263e5b', 3, 182, 16, 25);
    this.rect(context, '#5bcbd0', 5, 184, 12, 9);
    this.rect(context, '#c55ba5', 7, 195 + sway, 8, this.pixel);
    this.rect(context, '#f1dc8b', 9, 186, 4, this.pixel);
    this.rect(context, '#101827', 238, 193, 27, 18);
    this.rect(context, optics.foreground, 240, 191, 23, 6);
    this.rect(context, '#5ccbd0', 243, 192, 17, this.pixel);
    this.rect(context, '#c45aa5', 249, 199 + sway, 6, this.pixel);
  }
}
