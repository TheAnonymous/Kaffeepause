import type { Guest } from '../simulation/types';
import type { VenueKind } from '../venue';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

interface GuestDetailInput {
  context: CanvasRenderingContext2D;
  guest: Guest;
  x: number;
  headTop: number;
  bodyTop: number;
  footY: number;
  facing: 1 | -1;
  seated: boolean;
  variant: number;
  venue: VenueKind;
  pixel: number;
}

interface BaristaDetailInput {
  context: CanvasRenderingContext2D;
  x: number;
  top: number;
  headTop: number;
  facing: 1 | -1;
  uniformLight: string;
  apron: string;
  apronLight: string;
  venue: VenueKind;
  pixel: number;
}

// Kapselt die dicht gezeichneten Figurenmerkmale, unabhängig vom Raum-Renderer.
export class CharacterRenderer {
  constructor(private readonly rect: Rect, private readonly polygon: Polygon) {}

  drawGuestFineDetails(input: GuestDetailInput): void {
    const { context, guest, x, headTop, bodyTop, footY, facing, seated, variant, venue, pixel } = input;
    const visibleEye = x + facing * 2;
    const farEye = x - facing * 1.2;
    const eyeColor = variant === 0 ? '#8eb2b1' : variant === 3 ? '#b8875e' : '#4b3a39';
    const cheek = variant % 2 === 0 ? '#d98772' : '#c97667';

    this.rect(context, guest.palette.hair, farEye - pixel, headTop + 2.35, 1.5, pixel);
    this.rect(context, guest.palette.hair, visibleEye - pixel, headTop + 2.15, 1.8, pixel);
    this.rect(context, '#fff0d0', farEye - pixel, headTop + 3.2, 1.35, pixel);
    this.rect(context, '#fff0d0', visibleEye - pixel, headTop + 3.1, 1.5, pixel);
    this.rect(context, eyeColor, farEye, headTop + 3.2, pixel, pixel);
    this.rect(context, eyeColor, visibleEye, headTop + 3.1, pixel, pixel);
    this.rect(context, '#7b4c42', x + facing * 3, headTop + 4.8, pixel, 1.25);
    this.rect(context, cheek, x + facing * 2.8, headTop + 6.1, 1.15, pixel);
    this.rect(context, '#8e4e4a', x + facing * 1.5, headTop + 7.1, 1.8, pixel);
    this.rect(context, '#f1c49f', x - facing * 3.7, headTop + 4.8, pixel, 1.6);

    this.rect(context, '#1a171d', x - 3.5, headTop + 0.25, 2.5, pixel);
    this.rect(context, '#1a171d', x + 1.5, headTop + 0.25, 2, pixel);
    this.rect(context, guest.palette.hair, x + facing * 3.5, headTop + 1.2, pixel, 3.3);
    if (variant === 2 || variant === 4) this.rect(context, '#b67b59', x - facing * 4.5, headTop + 6, pixel, 2.2);

    this.polygon(context, '#2a232b', [[x - 5.1, bodyTop + 1], [x, bodyTop + 4], [x + 5.1, bodyTop + 1], [x + 3.2, bodyTop + 4.7], [x - 3.2, bodyTop + 4.7]]);
    this.rect(context, guest.palette.accent, x - 1.1, bodyTop + 2.2, 2.2, seated ? 6 : 9);
    this.rect(context, '#e9bc77', x - pixel, bodyTop + 5, pixel, pixel);
    this.rect(context, '#e9bc77', x - pixel, bodyTop + 8, pixel, pixel);
    this.rect(context, '#2b242c', x - 4.7, bodyTop + (seated ? 8.6 : 11.5), 3.4, pixel);
    this.rect(context, '#2b242c', x + 1.3, bodyTop + (seated ? 8.6 : 11.5), 3.4, pixel);
    this.rect(context, guest.palette.accent, x - 5.6, bodyTop + 6, pixel, 3);
    this.rect(context, guest.palette.accent, x + 5.25, bodyTop + 6, pixel, 3);

    if (!seated) {
      this.rect(context, '#bca585', x - 3.5, footY - 2, 2, pixel);
      this.rect(context, '#bca585', x + 1.5, footY - 2, 2, pixel);
      this.rect(context, '#0f141b', x - 4.5, footY + 0.8, 4.5, pixel);
      this.rect(context, '#0f141b', x + 1, footY + 0.8, 4.5, pixel);
    }

    if (venue === 'ramen' && guest.state === 'waiting') {
      this.rect(context, '#d95c4d', x + facing * 6 - 1, bodyTop + 4, 3, pixel);
      this.rect(context, '#f3c979', x + facing * 6, bodyTop + 3.3, 1, pixel);
    } else if (venue === 'arcade' && guest.state === 'activity' && guest.activity === 'phone') {
      this.rect(context, '#d260a5', x + facing * 5 - pixel, bodyTop + 3.2, pixel, 2);
      this.rect(context, '#68d0d0', x + facing * 5 - pixel, bodyTop + 5.5, pixel, pixel);
    }

    if (guest.regularId === 'sora') {
      this.rect(context, '#f2da8a', x - facing * 4.6, headTop + 2.2, pixel, pixel);
      this.rect(context, '#64d3cf', x + facing * 5.3, headTop + 6.1, pixel, pixel);
      if (seated && guest.activity === 'phone') {
        this.rect(context, '#e45f9d', x + facing * 6, bodyTop + 2.2, pixel, pixel);
        this.rect(context, '#f3e08e', x + facing * 6.8, bodyTop + 1.4, pixel, pixel);
      }
    } else if (guest.regularId === 'kai') {
      this.rect(context, '#e3bd70', x - facing * 5.2, headTop + 2.6, pixel, 3);
      this.rect(context, '#e3bd70', x - facing * 5.7, headTop + 2.1, 1.5, pixel);
      if (seated && guest.activity === 'journaling') {
        this.rect(context, '#91c19b', x + facing * 4.8, bodyTop + 6.2, pixel, 2);
        this.rect(context, '#e9d58e', x + facing * 5.8, bodyTop + 5.2, pixel, pixel);
      }
    }
  }

  drawBaristaFineDetails(input: BaristaDetailInput): void {
    const { context, x, top, headTop, facing, uniformLight, apron, apronLight, venue, pixel } = input;
    const badge = venue === 'ramen' ? '#d15b4d' : venue === 'arcade' ? '#63d1d0' : '#e7ba70';

    this.rect(context, '#2d2529', x - facing * 1.4, headTop + 2.25, 1.5, pixel);
    this.rect(context, '#2d2529', x + facing * 2.2, headTop + 2.1, 1.5, pixel);
    this.rect(context, '#fff0cc', x - facing * 1.2, headTop + 3.15, 1.2, pixel);
    this.rect(context, '#fff0cc', x + facing * 2.4, headTop + 3.05, 1.35, pixel);
    this.rect(context, '#4f5d5a', x - facing * 0.9, headTop + 3.15, pixel, pixel);
    this.rect(context, '#4f5d5a', x + facing * 2.65, headTop + 3.05, pixel, pixel);
    this.rect(context, '#a55a51', x + facing * 2.4, headTop + 6.4, 1.8, pixel);
    this.rect(context, '#e2aa82', x - facing * 3.8, headTop + 5, pixel, 1.8);
    this.rect(context, '#1a171d', x - 3.6, headTop + 0.25, 2.3, pixel);
    this.rect(context, '#1a171d', x + 1.4, headTop + 0.25, 2.3, pixel);

    this.rect(context, apronLight, x - 3.4, top + 8, 6.8, pixel);
    this.rect(context, '#9e725b', x - pixel, top + 8.4, pixel, 7.5);
    this.rect(context, '#a77960', x - 2.6, top + 13, 5.2, 2.2);
    this.rect(context, apron, x - 2.1, top + 13.4, 4.2, 1.3);
    this.rect(context, badge, x + facing * 2.3, top + 4.3, 1.8, 1.8);
    this.rect(context, '#fff0bd', x + facing * 2.7, top + 4.65, pixel, pixel);
    this.rect(context, uniformLight, x - 5.5, top + 5, pixel, 4);
    this.rect(context, uniformLight, x + 5.2, top + 5, pixel, 4);
    this.rect(context, '#e3bd83', x - pixel, top + 16.2, pixel, pixel);
    this.rect(context, '#e3bd83', x - pixel, top + 19.2, pixel, pixel);

    if (venue === 'ramen') {
      this.rect(context, '#e9c06c', x - 3, top + 12, 6, pixel);
      this.rect(context, '#b94f49', x - 3, top + 15.5, 6, pixel);
    } else if (venue === 'arcade') {
      this.rect(context, '#c85ba5', x - 3, top + 12, 6, pixel);
      this.rect(context, '#5ed1d0', x - 3, top + 15.5, 6, pixel);
    }
  }
}
