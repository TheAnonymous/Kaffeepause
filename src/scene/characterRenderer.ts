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
  bodyWidth: number;
  headWidth: number;
  headHeight: number;
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
    const { context, guest, x, headTop, bodyTop, footY, facing, seated, variant, bodyWidth, headWidth, headHeight, venue, pixel } = input;
    const eyeSpread = guest.appearance.face === 'narrow' ? 1.55 : guest.appearance.face === 'square' ? 2.15 : 1.85;
    const visibleEye = x + facing * eyeSpread;
    const farEye = x - facing * (eyeSpread - 0.55);
    const eyeColor = variant === 0 ? '#8eb2b1' : variant === 3 ? '#b8875e' : '#4b3a39';
    const cheek = variant % 2 === 0 ? '#d98772' : '#c97667';
    const bodyHalf = bodyWidth / 2;
    const headHalf = headWidth / 2;

    this.drawHairStyle(context, guest, x, headTop, headWidth, headHeight, facing, pixel);

    this.rect(context, guest.palette.hair, farEye - pixel, headTop + 2.35, 1.5, pixel);
    this.rect(context, guest.palette.hair, visibleEye - pixel, headTop + 2.15, 1.8, pixel);
    this.rect(context, '#fff0d0', farEye - pixel, headTop + 3.2, 1.35, pixel);
    this.rect(context, '#fff0d0', visibleEye - pixel, headTop + 3.1, 1.5, pixel);
    this.rect(context, eyeColor, farEye, headTop + 3.2, pixel, pixel);
    this.rect(context, eyeColor, visibleEye, headTop + 3.1, pixel, pixel);
    this.rect(context, '#7b4c42', x + facing * Math.min(3, headHalf - 1.2), headTop + 4.8, pixel, guest.appearance.face === 'square' ? 1.5 : 1.25);
    this.rect(context, cheek, x + facing * 2.8, headTop + 6.1, 1.15, pixel);
    this.rect(context, '#8e4e4a', x + facing * (guest.appearance.face === 'round' ? 1.2 : 1.6), headTop + (guest.appearance.face === 'square' ? 6.8 : 7.1), guest.appearance.maturity === 'young' ? 1.5 : 1.8, pixel);
    this.rect(context, guest.palette.skin, x - facing * Math.max(3.2, headHalf - 1.1), headTop + 4.8, pixel, 1.6);

    const browTilt = guest.appearance.body === 'angular' || guest.appearance.face === 'narrow' ? pixel : 0;
    this.rect(context, '#1a171d', x - eyeSpread - 1, headTop + 0.25 + browTilt, 2.3, pixel);
    this.rect(context, '#1a171d', x + eyeSpread - 0.8, headTop + 0.25, 2, pixel);
    this.rect(context, guest.palette.hair, x + facing * Math.max(3, headHalf - 2), headTop + 1.2, pixel, 3.3);
    if (variant === 2 || variant === 4) this.rect(context, '#b67b59', x - facing * 4.5, headTop + 6, pixel, 2.2);

    this.drawOutfitStyle(context, guest, x, bodyTop, bodyHalf, seated, pixel);
    this.drawPersonalDetail(context, guest, x, headTop, headHalf, facing, visibleEye, farEye, pixel);

    if (!seated) {
      this.rect(context, guest.palette.accent, x - 3.5, footY - 2, 2, pixel);
      this.rect(context, guest.palette.accent, x + 1.5, footY - 2, 2, pixel);
      this.rect(context, guest.palette.shoes, x - 4.5, footY + 0.8, 4.5, pixel);
      this.rect(context, guest.palette.shoes, x + 1, footY + 0.8, 4.5, pixel);
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

  private drawHairStyle(
    context: CanvasRenderingContext2D,
    guest: Guest,
    x: number,
    headTop: number,
    headWidth: number,
    headHeight: number,
    facing: 1 | -1,
    pixel: number,
  ): void {
    const half = headWidth / 2;
    const hair = guest.palette.hair;
    const ink = '#1a171d';
    switch (guest.appearance.hair) {
      case 'crop':
        this.rect(context, hair, x - half + 1, headTop - 1.2, headWidth - 2, 2.5);
        this.rect(context, ink, x - half + 2, headTop - 1.2, headWidth - 5, pixel);
        this.rect(context, hair, x - facing * (half - 1), headTop + 1, 2, 2);
        break;
      case 'bob':
        this.rect(context, hair, x - half - pixel, headTop + 1, 2.2, headHeight - 2);
        this.rect(context, hair, x + half - 1.7, headTop + 1, 2, headHeight - 1.5);
        this.rect(context, ink, x - half, headTop + headHeight - 1.5, headWidth, pixel);
        break;
      case 'curls':
        for (const [offsetX, offsetY] of [[-4, -1.5], [-1, -2.2], [2, -1.6], [4, 0], [-5, 2], [4.5, 3]] as const) {
          this.rect(context, hair, x + offsetX, headTop + offsetY, 2.5, 2.5);
          this.rect(context, ink, x + offsetX + pixel, headTop + offsetY, pixel, pixel);
        }
        break;
      case 'bun':
        this.rect(context, ink, x - facing * 3.5 - 2.5, headTop - 4, 5, 4);
        this.rect(context, hair, x - facing * 3.5 - 2, headTop - 3.5, 4, 3);
        this.rect(context, guest.palette.accent, x - facing * 3.5 - 1.5, headTop - 1, 3, pixel);
        break;
      case 'long':
        this.rect(context, hair, x - half, headTop + 2, 2.5, headHeight + 4);
        this.rect(context, hair, x + half - 2.5, headTop + 2, 2.5, headHeight + 4);
        this.rect(context, ink, x - half + pixel, headTop + headHeight + 4, 2, pixel);
        this.rect(context, ink, x + half - 2.2, headTop + headHeight + 4, 2, pixel);
        break;
      case 'undercut':
        this.polygon(context, hair, [[x - half, headTop], [x + half, headTop - 1.5], [x + facing * half, headTop + 2], [x - facing, headTop + 1.2]]);
        this.rect(context, '#8b6758', x - facing * (half - 1.3), headTop + 1.5, 2, pixel);
        this.rect(context, ink, x - facing * half, headTop - pixel, headWidth * 0.55, pixel);
        break;
      case 'ponytail':
        this.rect(context, ink, x - facing * (half + 2), headTop + 1, 3.5, 8);
        this.rect(context, hair, x - facing * (half + 1.7), headTop + 1.5, 2.8, 7);
        this.rect(context, guest.palette.accent, x - facing * (half + 0.2), headTop + 1.2, 1.5, 1.5);
        break;
      case 'waves':
        for (let row = 0; row < 3; row += 1) {
          const side = row % 2 ? 1 : -1;
          this.rect(context, hair, x + side * (half - 1.5), headTop + 2 + row * 2.5, 2.5, 3);
        }
        this.rect(context, hair, x - half + 1, headTop - 2, headWidth - 2, 2.5);
        break;
    }
    if (guest.appearance.maturity === 'older') {
      this.rect(context, '#b9aaa0', x - facing * 2.5, headTop - pixel, 1.5, 3);
      this.rect(context, '#ded0bd', x - facing * 2.2, headTop, pixel, 2);
    }
  }

  private drawOutfitStyle(
    context: CanvasRenderingContext2D,
    guest: Guest,
    x: number,
    bodyTop: number,
    bodyHalf: number,
    seated: boolean,
    pixel: number,
  ): void {
    const bottom = bodyTop + (seated ? 11 : 15);
    switch (guest.appearance.outfit) {
      case 'cardigan':
        this.rect(context, '#2a232b', x - pixel, bodyTop + 1, pixel * 2, seated ? 8 : 13);
        this.rect(context, guest.palette.accent, x - bodyHalf + 1, bodyTop + 2, 2, 2);
        this.rect(context, '#e9bc77', x + pixel, bodyTop + 4, pixel, pixel);
        this.rect(context, '#e9bc77', x + pixel, bodyTop + 7, pixel, pixel);
        break;
      case 'hoodie':
        this.polygon(context, '#2a232b', [[x - bodyHalf + 1, bodyTop + 1], [x - 2, bodyTop + 5], [x + 2, bodyTop + 5], [x + bodyHalf - 1, bodyTop + 1], [x + 3, bodyTop - 1], [x - 3, bodyTop - 1]]);
        this.rect(context, '#e8c77e', x - 2, bodyTop + 3, pixel, 4);
        this.rect(context, '#e8c77e', x + 1.5, bodyTop + 3, pixel, 4);
        this.rect(context, guest.palette.accent, x - 3, bottom - 4, 6, 2.5);
        break;
      case 'jacket':
        this.polygon(context, '#2a232b', [[x - bodyHalf + 1, bodyTop + 1], [x - 1, bodyTop + 5], [x - pixel, bottom], [x - bodyHalf + 1, bottom]]);
        this.polygon(context, guest.palette.accent, [[x + bodyHalf - 1, bodyTop + 1], [x + 1, bodyTop + 5], [x + pixel, bottom], [x + bodyHalf - 1, bottom]]);
        this.rect(context, '#d9b86c', x - pixel, bodyTop + 1, pixel, seated ? 4 : 11);
        break;
      case 'sweater':
        this.rect(context, guest.palette.accent, x - 3.5, bodyTop, 7, 2);
        this.rect(context, '#2b242c', x - bodyHalf + 1, bottom - 2, bodyHalf * 2 - 2, pixel);
        this.rect(context, '#2b242c', x - 4, bottom - 1, 2, pixel);
        this.rect(context, '#2b242c', x + 2, bottom - 1, 2, pixel);
        this.rect(context, guest.palette.accent, x - 1.5, bodyTop + 5, 3, 2);
        break;
      case 'overalls':
        this.rect(context, '#e6c078', x - 3.5, bodyTop + 1, pixel, 5);
        this.rect(context, '#e6c078', x + 3, bodyTop + 1, pixel, 5);
        this.rect(context, guest.palette.accent, x - 3.5, bodyTop + 5, 7, seated ? 5 : 9);
        this.rect(context, '#2b242c', x - 1.5, bodyTop + 7, 3, 2);
        break;
      case 'dress':
        this.rect(context, guest.palette.accent, x - bodyHalf + 1, bodyTop + 5, bodyHalf * 2 - 2, 2);
        this.polygon(context, guest.palette.accent, [[x - 3.5, bodyTop + 7], [x + 3.5, bodyTop + 7], [x + bodyHalf, bottom], [x - bodyHalf, bottom]]);
        this.rect(context, '#ead18a', x - bodyHalf + 1, bottom - pixel, bodyHalf * 2 - 2, pixel);
        break;
    }
    this.rect(context, '#2b242c', x - bodyHalf + 0.5, bodyTop + 6, pixel, 3);
    this.rect(context, '#2b242c', x + bodyHalf - pixel - 0.5, bodyTop + 6, pixel, 3);
  }

  private drawPersonalDetail(
    context: CanvasRenderingContext2D,
    guest: Guest,
    x: number,
    headTop: number,
    headHalf: number,
    facing: 1 | -1,
    visibleEye: number,
    farEye: number,
    pixel: number,
  ): void {
    switch (guest.appearance.detail) {
      case 'glasses':
        this.rect(context, '#25242b', farEye - 1.2, headTop + 2.7, 2.8, 2);
        this.rect(context, '#25242b', visibleEye - 1.2, headTop + 2.7, 2.8, 2);
        this.rect(context, '#a9c1bb', farEye - pixel, headTop + 3.1, 1.5, pixel);
        this.rect(context, '#a9c1bb', visibleEye - pixel, headTop + 3.1, 1.5, pixel);
        this.rect(context, '#25242b', x - pixel, headTop + 3.3, pixel * 2, pixel);
        break;
      case 'freckles':
        for (const offset of [-2, 0, 2]) this.rect(context, '#9c5f4f', x + offset + facing * 0.5, headTop + 5.4 + Math.abs(offset) * 0.15, pixel, pixel);
        break;
      case 'earring':
        this.rect(context, '#efc86f', x - facing * (headHalf + pixel), headTop + 5.5, 1.2, 1.8);
        this.rect(context, '#fff0a8', x - facing * headHalf, headTop + 6, pixel, pixel);
        break;
      case 'beard':
        this.polygon(context, '#4b3733', [[x - 3, headTop + 6], [x + 3, headTop + 6], [x + 2, headTop + 9], [x, headTop + 10], [x - 2, headTop + 9]]);
        this.rect(context, guest.palette.skin, x - 1.5, headTop + 6, 3, 1.5);
        break;
      case 'hairclip':
        this.rect(context, guest.palette.accent, x + facing * (headHalf - 2), headTop + 0.5, 2.5, 1.5);
        this.rect(context, '#f1db8a', x + facing * (headHalf - 1.5), headTop + 0.5, pixel, pixel);
        break;
      case 'mole':
        this.rect(context, '#6d453e', x + facing * 2.5, headTop + 5.8, pixel, pixel);
        break;
      case 'none':
        break;
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
