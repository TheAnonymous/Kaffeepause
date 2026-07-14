import type { Barista } from '../simulation/types';
import type { VenueKind } from '../venue';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;

export interface VenueRoomTheme {
  readonly wallFrom: string;
  readonly wallTo: string;
  readonly wallDark: string;
  readonly trim: string;
  readonly floor: string;
  readonly floorLight: string;
}

export interface VenueForegroundTheme {
  readonly base: string;
  readonly dark: string;
  readonly plank: string;
  readonly highlight: string;
  readonly moteLeft: string;
  readonly moteRight: string;
  readonly sparkle: string;
}

export interface VenueBaristaStyle {
  readonly uniform: string;
  readonly uniformLight: string;
  readonly apron: string;
  readonly apronLight: string;
}

export class VenueRenderer {
  roomTheme(venue: VenueKind, cafe: VenueRoomTheme): VenueRoomTheme {
    if (venue === 'ramen') return { wallFrom: '#542d36', wallTo: '#8b514a', wallDark: '#3d2835', trim: '#9f5549', floor: '#392c38', floorLight: '#51404a' };
    if (venue === 'arcade') return { wallFrom: '#202841', wallTo: '#394c68', wallDark: '#171c30', trim: '#46577a', floor: '#1e2638', floorLight: '#303b51' };
    return cafe;
  }

  foregroundTheme(venue: VenueKind): VenueForegroundTheme {
    if (venue === 'ramen') {
      return { base: '#352230', dark: '#221824', plank: '#7e3e43', highlight: '#e3a65f', moteLeft: '#e6a964', moteRight: '#c65a4e', sparkle: '#f2c87d' };
    }
    if (venue === 'arcade') {
      return { base: '#131a2a', dark: '#0b1120', plank: '#304e6b', highlight: '#61cbd0', moteLeft: '#c35aa5', moteRight: '#5bcbd0', sparkle: '#f2dd8e' };
    }
    return { base: '#38282f', dark: '#211b24', plank: '#6c4644', highlight: '#9b6250', moteLeft: '#e1b16c', moteRight: '#c78c58', sparkle: '#f2c87d' };
  }

  baristaStyle(venue: VenueKind): VenueBaristaStyle {
    if (venue === 'ramen') return { uniform: '#873e45', uniformLight: '#c25c52', apron: '#ead5ba', apronLight: '#fff0cd' };
    if (venue === 'arcade') return { uniform: '#3d5d86', uniformLight: '#63a8bd', apron: '#c6d3d2', apronLight: '#e7f0e4' };
    return { uniform: '#4f746d', uniformLight: '#70938a', apron: '#d9c4a4', apronLight: '#ead8ba' };
  }

  drawHostAccent(
    context: CanvasRenderingContext2D,
    barista: Barista,
    venue: VenueKind,
    rect: Rect,
    snap: (value: number) => number,
    pixel: number,
  ): void {
    if (venue === 'cafe') return;
    const x = snap(barista.position.x);
    const headTop = snap(barista.position.y - 38);
    if (venue === 'ramen') {
      rect(context, '#f0dfc1', x - 6, headTop - 5, 12, 5);
      rect(context, '#fff0d0', x - 4, headTop - 7, 8, 3);
      rect(context, '#ba5149', x - 7, headTop - 1, 14, 2);
      rect(context, '#eab565', x - 1, headTop - 1, 2, pixel);
      return;
    }
    rect(context, '#17243a', x - 7, headTop - 2, 14, 3);
    rect(context, '#5ccbd0', x - 6, headTop - 3, 12, 1);
    rect(context, '#c35aa5', x - 3, headTop - 4, 6, pixel);
    rect(context, '#e7d985', x + 4, headTop + 3, 2, pixel);
  }
}
