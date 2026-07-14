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
  litFrom: 1 | -1;
  rimColor: string;
  rimStrength: number;
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
  litFrom: 1 | -1;
  rimColor: string;
}

function mixColor(left: string, right: string, amount: number): string {
  const progress = Math.min(1, Math.max(0, amount));
  const value = (color: string, offset: number): number => Number.parseInt(color.slice(offset, offset + 2), 16);
  const channel = (offset: number): string => Math.round(value(left, offset) + (value(right, offset) - value(left, offset)) * progress)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// Kapselt die dicht gezeichneten Figurenmerkmale, unabhängig vom Raum-Renderer.
export class CharacterRenderer {
  constructor(private readonly rect: Rect, private readonly polygon: Polygon) {}

  drawGuestFineDetails(input: GuestDetailInput): void {
    const {
      context, guest, x, headTop, bodyTop, footY, facing, seated, variant,
      bodyWidth, headWidth, headHeight, venue, pixel, litFrom, rimColor, rimStrength,
    } = input;
    const eyeSpread = guest.appearance.face === 'narrow' ? 1.45 : guest.appearance.face === 'square' ? 2.05 : 1.75;
    const visibleEye = x + facing * eyeSpread;
    const farEye = x - facing * (eyeSpread - 0.5);
    const eyeColor = variant === 0 ? '#709b99' : variant === 3 ? '#9b694b' : variant === 5 ? '#5f6f91' : '#493638';
    const cheek = variant % 2 === 0 ? '#d98772' : '#c97667';
    const bodyHalf = bodyWidth / 2;
    const headHalf = headWidth / 2;
    const skinShadow = mixColor(guest.palette.skin, '#4b2b35', 0.28);
    const skinLight = mixColor(guest.palette.skin, '#ffe9bd', 0.48);
    const hairLight = mixColor(guest.palette.hair, rimColor, 0.32);
    const coatShadow = mixColor(guest.palette.coat, '#171923', 0.32);
    const coatLight = mixColor(guest.palette.coat, rimColor, 0.28);
    const shadowX = litFrom > 0 ? x - headHalf + 1 : x + headHalf - 2;
    const lightX = litFrom > 0 ? x + headHalf - 1.5 : x - headHalf + 1;

    // Kopfmodell mit sechs Rasterzellen pro Weltpixel: Wange, Kiefer und Nase
    // besitzen jetzt echte Lichtflächen statt nur eines einzelnen Grobpixels.
    this.rect(context, skinShadow, shadowX, headTop + 1.2, 1, headHeight - 2.7);
    this.rect(context, skinLight, lightX, headTop + 1.35, pixel * 2, headHeight - 3.2);
    this.polygon(context, skinShadow, [
      [x - headHalf + 1.2, headTop + headHeight - 2.4],
      [x + headHalf - 1.2, headTop + headHeight - 2.4],
      [x + facing * 1.5, headTop + headHeight - 1],
      [x - facing * 2.1, headTop + headHeight - 1.2],
    ]);
    this.rect(context, guest.palette.skin, x - 2.4, headTop + headHeight - 2.5, 4.2, 1.2);

    this.drawHairStyle(context, guest, x, headTop, headWidth, headHeight, facing, pixel, hairLight);
    this.drawOutfitStyle(context, guest, x, bodyTop, bodyHalf, seated, pixel, coatShadow, coatLight);

    const eyeY = headTop + (guest.appearance.face === 'square' ? 3.15 : 3.35);
    const browY = eyeY - 1.15;
    const browTilt = guest.appearance.body === 'angular' || guest.appearance.face === 'narrow' ? pixel * 2 : 0;
    this.rect(context, guest.palette.hair, farEye - 0.85, browY + browTilt, 1.5, pixel * 2);
    this.rect(context, guest.palette.hair, visibleEye - 0.75, browY, 1.65, pixel * 2);
    this.rect(context, '#fff2d7', farEye - 0.62, eyeY, 1.25, pixel * 4);
    this.rect(context, '#fff5df', visibleEye - 0.7, eyeY - pixel, 1.45, pixel * 5);
    this.rect(context, eyeColor, farEye - pixel, eyeY, pixel * 3, pixel * 4);
    this.rect(context, eyeColor, visibleEye - pixel, eyeY - pixel, pixel * 3, pixel * 5);
    this.rect(context, '#151821', farEye, eyeY + pixel, pixel * 2, pixel * 3);
    this.rect(context, '#151821', visibleEye, eyeY, pixel * 2, pixel * 4);
    this.rect(context, '#fffbed', visibleEye + pixel, eyeY, pixel, pixel);

    const noseX = x + facing * Math.min(2.8, headHalf - 1.35);
    this.rect(context, skinShadow, noseX, headTop + 4.6, pixel * 2, 1.35);
    this.rect(context, skinLight, noseX + facing * pixel, headTop + 4.55, pixel, 0.75);
    this.rect(context, '#7d493f', noseX + (facing > 0 ? pixel : -pixel), headTop + 5.75, pixel * 2, pixel * 2);
    this.rect(context, cheek, x + facing * 2.4, headTop + 6.15, 1.1, pixel * 2);
    this.rect(context, mixColor(guest.palette.skin, cheek, 0.4), x - facing * 2.6, headTop + 6.25, 0.85, pixel);

    const mouthY = headTop + (guest.appearance.face === 'square' ? 7.05 : 7.25);
    const mouthWidth = guest.appearance.maturity === 'young' ? 1.45 : 1.75;
    this.rect(context, '#713c41', x + facing * 0.35 - mouthWidth / 2, mouthY, mouthWidth, pixel * 2);
    this.rect(context, '#d58376', x + facing * 0.55 - mouthWidth / 3, mouthY, mouthWidth * 0.62, pixel);
    if (guest.activity === 'talking') this.rect(context, '#f4d5b2', x + facing * 0.4 - pixel, mouthY + pixel * 2, pixel * 3, pixel);

    this.rect(context, skinShadow, x - facing * (headHalf - 0.5), headTop + 4.4, 1.15, 2.1);
    this.rect(context, skinLight, x - facing * (headHalf - 0.35), headTop + 4.75, pixel * 2, 0.7);
    this.rect(context, '#9d6355', x - facing * (headHalf - 0.15), headTop + 5.45, pixel * 2, pixel * 2);

    this.drawPersonalDetail(context, guest, x, headTop, headHalf, facing, visibleEye, farEye, pixel);

    // Saum, Schnürung und Schuhkappen werden erst durch die 6×-Matrix lesbar.
    if (!seated) {
      this.rect(context, guest.palette.accent, x - 3.5, footY - 2, 2, pixel * 2);
      this.rect(context, guest.palette.accent, x + 1.5, footY - 2, 2, pixel * 2);
      this.rect(context, guest.palette.shoes, x - 4.5, footY + 0.8, 4.5, pixel * 2);
      this.rect(context, guest.palette.shoes, x + 1, footY + 0.8, 4.5, pixel * 2);
      this.rect(context, mixColor(guest.palette.shoes, '#ffffff', 0.28), x - 4, footY + 0.8, 2.2, pixel);
      this.rect(context, mixColor(guest.palette.shoes, '#ffffff', 0.28), x + 1.5, footY + 0.8, 2.2, pixel);
      for (const laceX of [x - 3.4, x + 2.2]) {
        this.rect(context, '#d4c6aa', laceX, footY + 0.15, 1.25, pixel);
        this.rect(context, '#d4c6aa', laceX + pixel, footY + 0.5, 1.1, pixel);
      }
    }

    if (venue === 'ramen' && guest.state === 'waiting') {
      this.rect(context, '#d95c4d', x + facing * 6 - 1, bodyTop + 4, 3, pixel * 2);
      this.rect(context, '#f3c979', x + facing * 6, bodyTop + 3.3, 1, pixel);
    } else if (venue === 'arcade' && guest.state === 'activity' && guest.activity === 'phone') {
      this.rect(context, '#d260a5', x + facing * 5 - pixel, bodyTop + 3.2, pixel * 2, 2);
      this.rect(context, '#68d0d0', x + facing * 5 - pixel, bodyTop + 5.5, pixel * 2, pixel * 2);
    }

    if (guest.regularId === 'sora') {
      this.rect(context, '#f2da8a', x - facing * 4.6, headTop + 2.2, pixel * 2, pixel * 2);
      this.rect(context, '#64d3cf', x + facing * 5.3, headTop + 6.1, pixel * 2, pixel * 2);
    } else if (guest.regularId === 'kai') {
      this.rect(context, '#e3bd70', x - facing * 5.2, headTop + 2.6, pixel * 2, 3);
      this.rect(context, '#e3bd70', x - facing * 5.7, headTop + 2.1, 1.5, pixel * 2);
    }

    context.save();
    context.globalAlpha = 0.2 + rimStrength * 0.42;
    context.globalCompositeOperation = 'screen';
    const rimX = litFrom > 0 ? x + headHalf - pixel * 2 : x - headHalf;
    this.rect(context, rimColor, rimX, headTop + 0.5, pixel * 2, Math.max(3, headHeight - 2));
    const shoulderX = litFrom > 0 ? x + bodyHalf - pixel * 2 : x - bodyHalf;
    this.rect(context, rimColor, shoulderX, bodyTop + 0.5, pixel * 2, seated ? 7 : 13);
    this.rect(context, hairLight, x + litFrom * (headHalf - 1.5), headTop - pixel, pixel * 2, 2.5);
    context.restore();
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
    hairLight: string,
  ): void {
    const half = headWidth / 2;
    const hair = guest.palette.hair;
    const ink = '#1a171d';
    switch (guest.appearance.hair) {
      case 'crop':
        this.rect(context, hair, x - half + 1, headTop - 1.2, headWidth - 2, 2.5);
        this.rect(context, ink, x - half + 2, headTop - 1.2, headWidth - 5, pixel * 2);
        for (let strand = 0; strand < 4; strand += 1) {
          this.rect(context, hairLight, x - half + 2 + strand * 1.55, headTop - 0.65 + (strand % 2) * pixel, 0.85, pixel);
        }
        this.rect(context, hair, x - facing * (half - 1), headTop + 1, 2, 2);
        break;
      case 'bob':
        this.rect(context, hair, x - half - pixel, headTop + 1, 2.2, headHeight - 2);
        this.rect(context, hair, x + half - 1.7, headTop + 1, 2, headHeight - 1.5);
        this.rect(context, ink, x - half, headTop + headHeight - 1.5, headWidth, pixel * 2);
        this.rect(context, hairLight, x + facing * (half - 1.1), headTop + 1.8, pixel * 2, headHeight - 4);
        this.rect(context, hairLight, x - facing * 1.5, headTop - 0.4, 2.5, pixel);
        break;
      case 'curls':
        for (const [offsetX, offsetY] of [[-4, -1.5], [-1, -2.2], [2, -1.6], [4, 0], [-5, 2], [4.5, 3]] as const) {
          this.rect(context, hair, x + offsetX, headTop + offsetY, 2.5, 2.5);
          this.rect(context, ink, x + offsetX + pixel, headTop + offsetY, pixel * 2, pixel * 2);
          this.rect(context, hairLight, x + offsetX + pixel * 3, headTop + offsetY + pixel, pixel * 2, pixel);
        }
        break;
      case 'bun':
        this.rect(context, ink, x - facing * 3.5 - 2.5, headTop - 4, 5, 4);
        this.rect(context, hair, x - facing * 3.5 - 2, headTop - 3.5, 4, 3);
        this.rect(context, guest.palette.accent, x - facing * 3.5 - 1.5, headTop - 1, 3, pixel);
        this.rect(context, hairLight, x - facing * 3.5 - 1, headTop - 3.1, 1.7, pixel * 2);
        break;
      case 'long':
        this.rect(context, hair, x - half, headTop + 2, 2.5, headHeight + 4);
        this.rect(context, hair, x + half - 2.5, headTop + 2, 2.5, headHeight + 4);
        this.rect(context, ink, x - half + pixel, headTop + headHeight + 4, 2, pixel * 2);
        this.rect(context, ink, x + half - 2.2, headTop + headHeight + 4, 2, pixel * 2);
        this.rect(context, hairLight, x + facing * (half - 1.5), headTop + 2.5, pixel * 2, headHeight + 1);
        for (let strand = 0; strand < 3; strand += 1) this.rect(context, hairLight, x - half + 0.7 + strand * 0.55, headTop + 4 + strand * 2.6, pixel, 2);
        break;
      case 'undercut':
        this.polygon(context, hair, [[x - half, headTop], [x + half, headTop - 1.5], [x + facing * half, headTop + 2], [x - facing, headTop + 1.2]]);
        this.rect(context, '#8b6758', x - facing * (half - 1.3), headTop + 1.5, 2, pixel);
        this.rect(context, ink, x - facing * half, headTop - pixel, headWidth * 0.55, pixel);
        this.rect(context, hairLight, x + facing * 0.4, headTop - 0.65, headWidth * 0.42, pixel * 2);
        this.rect(context, hairLight, x + facing * 1.2, headTop + pixel, headWidth * 0.3, pixel);
        break;
      case 'ponytail':
        this.rect(context, ink, x - facing * (half + 2), headTop + 1, 3.5, 8);
        this.rect(context, hair, x - facing * (half + 1.7), headTop + 1.5, 2.8, 7);
        this.rect(context, guest.palette.accent, x - facing * (half + 0.2), headTop + 1.2, 1.5, 1.5);
        this.rect(context, hairLight, x - facing * (half + 0.9), headTop + 2, pixel * 2, 5.5);
        break;
      case 'waves':
        for (let row = 0; row < 3; row += 1) {
          const side = row % 2 ? 1 : -1;
          this.rect(context, hair, x + side * (half - 1.5), headTop + 2 + row * 2.5, 2.5, 3);
          this.rect(context, hairLight, x + side * (half - 1.2), headTop + 2.4 + row * 2.5, pixel * 2, 1.2);
        }
        this.rect(context, hair, x - half + 1, headTop - 2, headWidth - 2, 2.5);
        this.rect(context, hairLight, x - half + 2.1, headTop - 1.4, headWidth * 0.48, pixel * 2);
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
    coatShadow: string,
    coatLight: string,
  ): void {
    const bottom = bodyTop + (seated ? 11 : 15);
    switch (guest.appearance.outfit) {
      case 'cardigan':
        this.rect(context, coatShadow, x - pixel, bodyTop + 1, pixel * 2, seated ? 8 : 13);
        this.rect(context, guest.palette.accent, x - bodyHalf + 1, bodyTop + 2, 2, 2);
        this.rect(context, '#e9bc77', x + pixel, bodyTop + 4, pixel * 2, pixel * 2);
        this.rect(context, '#e9bc77', x + pixel, bodyTop + 7, pixel * 2, pixel * 2);
        this.rect(context, coatLight, x - bodyHalf + 1.2, bodyTop + 1.5, pixel * 2, seated ? 7 : 11);
        break;
      case 'hoodie':
        this.polygon(context, '#2a232b', [[x - bodyHalf + 1, bodyTop + 1], [x - 2, bodyTop + 5], [x + 2, bodyTop + 5], [x + bodyHalf - 1, bodyTop + 1], [x + 3, bodyTop - 1], [x - 3, bodyTop - 1]]);
        this.rect(context, '#e8c77e', x - 2, bodyTop + 3, pixel, 4);
        this.rect(context, '#e8c77e', x + 1.5, bodyTop + 3, pixel, 4);
        this.rect(context, guest.palette.accent, x - 3, bottom - 4, 6, 2.5);
        this.rect(context, coatLight, x - bodyHalf + 1.3, bodyTop + 1, pixel * 2, 6);
        this.rect(context, coatShadow, x - 2.3, bodyTop + 6.2, 4.6, pixel * 2);
        break;
      case 'jacket':
        this.polygon(context, '#2a232b', [[x - bodyHalf + 1, bodyTop + 1], [x - 1, bodyTop + 5], [x - pixel, bottom], [x - bodyHalf + 1, bottom]]);
        this.polygon(context, guest.palette.accent, [[x + bodyHalf - 1, bodyTop + 1], [x + 1, bodyTop + 5], [x + pixel, bottom], [x + bodyHalf - 1, bottom]]);
        this.rect(context, '#d9b86c', x - pixel, bodyTop + 1, pixel, seated ? 4 : 11);
        this.rect(context, coatLight, x - bodyHalf + 1.3, bodyTop + 2, pixel * 2, seated ? 5 : 10);
        this.rect(context, coatShadow, x + bodyHalf - 2, bodyTop + 5, pixel * 2, seated ? 4 : 8);
        break;
      case 'sweater':
        this.rect(context, guest.palette.accent, x - 3.5, bodyTop, 7, 2);
        this.rect(context, '#2b242c', x - bodyHalf + 1, bottom - 2, bodyHalf * 2 - 2, pixel);
        this.rect(context, '#2b242c', x - 4, bottom - 1, 2, pixel);
        this.rect(context, '#2b242c', x + 2, bottom - 1, 2, pixel);
        this.rect(context, guest.palette.accent, x - 1.5, bodyTop + 5, 3, 2);
        for (let stitch = 0; stitch < 4; stitch += 1) this.rect(context, coatLight, x - bodyHalf + 1.2 + stitch * 2.4, bodyTop + 3.5, 1.1, pixel);
        break;
      case 'overalls':
        this.rect(context, '#e6c078', x - 3.5, bodyTop + 1, pixel, 5);
        this.rect(context, '#e6c078', x + 3, bodyTop + 1, pixel, 5);
        this.rect(context, guest.palette.accent, x - 3.5, bodyTop + 5, 7, seated ? 5 : 9);
        this.rect(context, '#2b242c', x - 1.5, bodyTop + 7, 3, 2);
        this.rect(context, coatLight, x - 3, bodyTop + 5.5, pixel * 2, seated ? 3.5 : 7);
        this.rect(context, '#e9d08a', x - 2.5, bodyTop + 6.5, pixel * 2, pixel * 2);
        break;
      case 'dress':
        this.rect(context, guest.palette.accent, x - bodyHalf + 1, bodyTop + 5, bodyHalf * 2 - 2, 2);
        this.polygon(context, guest.palette.accent, [[x - 3.5, bodyTop + 7], [x + 3.5, bodyTop + 7], [x + bodyHalf, bottom], [x - bodyHalf, bottom]]);
        this.rect(context, '#ead18a', x - bodyHalf + 1, bottom - pixel, bodyHalf * 2 - 2, pixel);
        this.polygon(context, coatLight, [[x - 2.8, bodyTop + 7.4], [x - 1.7, bodyTop + 7.4], [x - 2.6, bottom - 1], [x - 3.6, bottom - 1]]);
        this.polygon(context, coatShadow, [[x + 1.7, bodyTop + 7.4], [x + 2.8, bodyTop + 7.4], [x + 3.8, bottom - 1], [x + 2.7, bottom - 1]]);
        break;
    }
    this.rect(context, coatShadow, x - bodyHalf + 0.5, bodyTop + 6, pixel * 2, 3);
    this.rect(context, coatShadow, x + bodyHalf - pixel * 2 - 0.5, bodyTop + 6, pixel * 2, 3);
    this.rect(context, coatLight, x - bodyHalf + 1.2, bottom - 1.35, bodyHalf * 2 - 2.4, pixel);
    this.rect(context, coatShadow, x - bodyHalf + 1.8, bottom - 0.75, bodyHalf * 2 - 3.6, pixel);
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
        this.rect(context, '#25242b', farEye - 1.1, headTop + 2.75, 2.5, 1.75);
        this.rect(context, '#25242b', visibleEye - 1.1, headTop + 2.75, 2.5, 1.75);
        this.rect(context, '#a9c1bb', farEye - 0.75, headTop + 3.05, 1.8, 1.05);
        this.rect(context, '#a9c1bb', visibleEye - 0.75, headTop + 3.05, 1.8, 1.05);
        this.rect(context, '#e8fbef', visibleEye - 0.55, headTop + 3.1, pixel * 2, pixel);
        this.rect(context, '#25242b', x - pixel, headTop + 3.3, pixel * 2, pixel * 2);
        break;
      case 'freckles':
        for (const offset of [-2, -1, 0, 1, 2]) this.rect(context, '#9c5f4f', x + offset + facing * 0.5, headTop + 5.4 + Math.abs(offset) * 0.12, pixel, pixel);
        break;
      case 'earring':
        this.rect(context, '#efc86f', x - facing * (headHalf + pixel), headTop + 5.5, 1.2, 1.8);
        this.rect(context, '#fff0a8', x - facing * headHalf, headTop + 6, pixel, pixel);
        this.rect(context, '#fff7cc', x - facing * (headHalf + pixel * 2), headTop + 6.7, pixel, pixel);
        break;
      case 'beard':
        this.polygon(context, '#4b3733', [[x - 3, headTop + 6], [x + 3, headTop + 6], [x + 2, headTop + 9], [x, headTop + 10], [x - 2, headTop + 9]]);
        this.rect(context, guest.palette.skin, x - 1.5, headTop + 6, 3, 1.5);
        for (const offset of [-1.8, -0.6, 0.8, 1.8]) this.rect(context, '#725249', x + offset, headTop + 7.6 + Math.abs(offset) * 0.35, pixel, 1.2);
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
    const { context, x, top, headTop, facing, uniformLight, apron, apronLight, venue, pixel, litFrom, rimColor } = input;
    const badge = venue === 'ramen' ? '#d15b4d' : venue === 'arcade' ? '#63d1d0' : '#e7ba70';

    this.rect(context, '#2d2529', x - facing * 1.4, headTop + 2.25, 1.5, pixel * 2);
    this.rect(context, '#2d2529', x + facing * 2.2, headTop + 2.1, 1.5, pixel * 2);
    this.rect(context, '#fff0cc', x - facing * 1.2, headTop + 3.15, 1.2, pixel * 4);
    this.rect(context, '#fff0cc', x + facing * 2.4, headTop + 3.05, 1.35, pixel * 5);
    this.rect(context, '#4f5d5a', x - facing * 0.9, headTop + 3.15, pixel * 2, pixel * 3);
    this.rect(context, '#4f5d5a', x + facing * 2.65, headTop + 3.05, pixel * 2, pixel * 4);
    this.rect(context, '#fffbed', x + facing * 2.8, headTop + 3.05, pixel, pixel);
    this.rect(context, '#a55a51', x + facing * 2.4, headTop + 6.4, 1.8, pixel * 2);
    this.rect(context, '#e7a285', x + facing * 2.8, headTop + 6.4, 0.8, pixel);
    this.rect(context, '#e2aa82', x - facing * 3.8, headTop + 5, pixel, 1.8);
    this.rect(context, '#1a171d', x - 3.6, headTop + 0.25, 2.3, pixel * 2);
    this.rect(context, '#1a171d', x + 1.4, headTop + 0.25, 2.3, pixel * 2);

    this.rect(context, apronLight, x - 3.4, top + 8, 6.8, pixel);
    this.rect(context, '#9e725b', x - pixel, top + 8.4, pixel, 7.5);
    this.rect(context, '#a77960', x - 2.6, top + 13, 5.2, 2.2);
    this.rect(context, apron, x - 2.1, top + 13.4, 4.2, 1.3);
    this.rect(context, badge, x + facing * 2.3, top + 4.3, 1.8, 1.8);
    this.rect(context, '#fff0bd', x + facing * 2.7, top + 4.65, pixel * 2, pixel * 2);
    this.rect(context, uniformLight, x - 5.5, top + 5, pixel * 2, 4);
    this.rect(context, uniformLight, x + 5.2, top + 5, pixel * 2, 4);
    this.rect(context, '#e3bd83', x - pixel, top + 16.2, pixel * 2, pixel * 2);
    this.rect(context, '#e3bd83', x - pixel, top + 19.2, pixel * 2, pixel * 2);
    for (let seam = 0; seam < 3; seam += 1) this.rect(context, '#c5966e', x - 3 + seam * 3, top + 14.5, 1.2, pixel);

    if (venue === 'ramen') {
      this.rect(context, '#e9c06c', x - 3, top + 12, 6, pixel);
      this.rect(context, '#b94f49', x - 3, top + 15.5, 6, pixel);
    } else if (venue === 'arcade') {
      this.rect(context, '#c85ba5', x - 3, top + 12, 6, pixel);
      this.rect(context, '#5ed1d0', x - 3, top + 15.5, 6, pixel);
    }

    context.save();
    context.globalAlpha = 0.34;
    context.globalCompositeOperation = 'screen';
    this.rect(context, rimColor, litFrom > 0 ? x + 5 - pixel * 2 : x - 5, headTop + 0.5, pixel * 2, 7.5);
    this.rect(context, rimColor, litFrom > 0 ? x + 5 - pixel * 2 : x - 5.5, top + 1, pixel * 2, 12);
    context.restore();
  }
}
