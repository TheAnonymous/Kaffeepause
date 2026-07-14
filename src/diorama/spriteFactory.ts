import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
  NoColorSpace,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Barista, Guest, GuestAppearance, GuestPalette } from '../simulation/types';
import type { VenueKind } from '../venue';
import type { CharacterPose, CharacterVisualState } from './characterVisualState';
import { DIORAMA } from './types';

type PixelContext = CanvasRenderingContext2D;

interface SpriteDescription {
  readonly palette: GuestPalette;
  readonly appearance: GuestAppearance;
  readonly seated: boolean;
  readonly activity: CharacterPose;
  readonly accessory?: Guest['accessory'];
  readonly regular: boolean;
  readonly venue: VenueKind;
  readonly barista: boolean;
  readonly visual: CharacterVisualState;
}

const BARISTA_APPEARANCE: GuestAppearance = {
  body: 'angular', face: 'oval', hair: 'crop', outfit: 'overalls', detail: 'earring',
  maturity: 'adult', heightOffset: 1, widthOffset: 0, pattern: 2,
};

const BARISTA_PALETTES: Readonly<Record<VenueKind, GuestPalette>> = {
  cafe: { skin: '#c98363', hair: '#241b24', coat: '#3e716b', accent: '#e7bd79', trousers: '#2c3440', shoes: '#1d1920' },
  ramen: { skin: '#c98363', hair: '#241b24', coat: '#a94342', accent: '#f0d09a', trousers: '#33262e', shoes: '#1d1920' },
  arcade: { skin: '#c98363', hair: '#241b24', coat: '#365a74', accent: '#56dde1', trousers: '#242d45', shoes: '#15192a' },
};

function shade(color: string, amount: number): string {
  const source = Number.parseInt(color.slice(1), 16);
  const channels = [source >> 16, (source >> 8) & 255, source & 255];
  const result = channels.map((channel) => Math.round(
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount),
  ));
  return `#${result.map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function pixel(context: PixelContext, color: string, x: number, y: number, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function hair(context: PixelContext, description: SpriteDescription, headX: number, top: number, headWidth: number): void {
  const color = description.palette.hair;
  const dark = shade(color, -0.32);
  const light = shade(color, 0.2);
  const right = headX + headWidth;
  pixel(context, dark, headX - 3, top + 3, headWidth + 6, 15);
  pixel(context, color, headX, top, headWidth, 9);
  pixel(context, light, headX + 4, top + 2, Math.max(5, headWidth - 12), 3);
  switch (description.appearance.hair) {
    case 'bob':
      pixel(context, color, headX - 4, top + 11, 7, 28);
      pixel(context, dark, right - 3, top + 12, 7, 27);
      break;
    case 'curls':
      for (const [x, y] of [[-5, 7], [1, -3], [10, -5], [20, -3], [27, 7], [-4, 18], [28, 18]] as const) {
        pixel(context, color, headX + x, top + y, 9, 9);
        pixel(context, light, headX + x + 2, top + y + 1, 3, 3);
      }
      break;
    case 'bun':
      pixel(context, dark, headX + headWidth - 7, top - 12, 15, 14);
      pixel(context, color, headX + headWidth - 5, top - 14, 11, 11);
      break;
    case 'long':
      pixel(context, color, headX - 4, top + 9, 7, 42);
      pixel(context, dark, right - 3, top + 8, 8, 45);
      break;
    case 'undercut':
      pixel(context, dark, headX - 2, top + 10, 6, 17);
      pixel(context, light, headX + 7, top - 3, headWidth - 5, 6);
      break;
    case 'ponytail':
      pixel(context, dark, right - 1, top + 9, 9, 10);
      pixel(context, color, right + 3, top + 17, 8, 30);
      pixel(context, light, right + 4, top + 20, 3, 17);
      break;
    case 'waves':
      pixel(context, color, headX - 4, top + 9, 8, 29);
      pixel(context, dark, right - 2, top + 8, 8, 31);
      pixel(context, light, headX - 2, top + 14, 4, 4);
      pixel(context, light, right, top + 20, 4, 4);
      break;
    default:
      pixel(context, dark, headX - 2, top + 7, 5, 16);
      break;
  }
}

function face(context: PixelContext, description: SpriteDescription, x: number, y: number, width: number, height: number): void {
  const { palette, appearance } = description;
  const skinLight = shade(palette.skin, 0.22);
  const skinDark = shade(palette.skin, -0.24);
  const ink = '#211923';
  const shapeInset = appearance.face === 'narrow' ? 3 : appearance.face === 'oval' ? 2 : 0;
  pixel(context, skinDark, x + shapeInset, y + 3, width - shapeInset * 2, height - 5);
  pixel(context, palette.skin, x + shapeInset, y, width - shapeInset * 2, height - 6);
  pixel(context, skinLight, x + shapeInset + 4, y + 3, 5, height - 13);
  pixel(context, ink, x + 7, y + 13, 4, 4);
  pixel(context, ink, x + width - 11, y + 13, 4, 4);
  pixel(context, '#f1d5bb', x + 8, y + 13, 1, 1);
  pixel(context, '#f1d5bb', x + width - 10, y + 13, 1, 1);
  pixel(context, skinDark, x + Math.floor(width / 2), y + 18, 3, 4);
  if (description.visual.expression === 'laugh') {
    pixel(context, '#75434a', x + Math.floor(width / 2) - 6, y + 25, 14, 7);
    pixel(context, '#f4d2b3', x + Math.floor(width / 2) - 3, y + 25, 8, 3);
  } else if (description.visual.expression === 'surprised') {
    pixel(context, '#75434a', x + Math.floor(width / 2) - 3, y + 25, 7, 7);
  } else if (description.visual.expression === 'smile') {
    pixel(context, '#75434a', x + Math.floor(width / 2) - 5, y + 25, 12, 4);
    pixel(context, palette.skin, x + Math.floor(width / 2) - 3, y + 25, 8, 2);
  } else {
    pixel(context, '#75434a', x + Math.floor(width / 2) - 4, y + 26, 10, 2);
  }

  if (appearance.detail === 'glasses') {
    pixel(context, '#313141', x + 3, y + 10, 11, 2);
    pixel(context, '#313141', x + width - 14, y + 10, 11, 2);
    pixel(context, '#313141', x + 13, y + 12, width - 26, 2);
    pixel(context, '#313141', x + 4, y + 12, 2, 9);
    pixel(context, '#313141', x + width - 6, y + 12, 2, 9);
  } else if (appearance.detail === 'freckles') {
    for (const dx of [6, 11, width - 12, width - 7]) pixel(context, '#a35c51', x + dx, y + 22, 2, 2);
  } else if (appearance.detail === 'beard') {
    pixel(context, shade(palette.hair, 0.05), x + 5, y + 24, width - 10, 10);
    pixel(context, '#75434a', x + Math.floor(width / 2) - 4, y + 26, 10, 2);
  } else if (appearance.detail === 'mole') {
    pixel(context, '#553036', x + width - 8, y + 24, 2, 2);
  } else if (appearance.detail === 'earring') {
    pixel(context, '#f2c567', x + width - 1, y + 20, 3, 5);
  }
  if (appearance.maturity === 'older') {
    pixel(context, shade(palette.skin, -0.12), x + 4, y + 23, 5, 1);
    pixel(context, shade(palette.skin, -0.12), x + width - 9, y + 23, 5, 1);
  }
}

function activityProp(context: PixelContext, description: SpriteDescription, centerX: number, y: number): void {
  const frameLift = description.visual.frame === 1 ? -3 : description.visual.frame === 3 ? 2 : 0;
  y += frameLift;
  const ink = '#211923';
  const paper = '#f2dfb5';
  switch (description.activity) {
    case 'reading':
      pixel(context, paper, centerX - 25, y, 23, 18);
      pixel(context, shade(paper, -0.12), centerX + 2, y, 23, 18);
      pixel(context, '#bd695a', centerX - 2, y, 4, 19);
      pixel(context, '#80665e', centerX - 20, y + 5, 14, 2);
      pixel(context, '#80665e', centerX + 7, y + 5, 13, 2);
      break;
    case 'typing':
      pixel(context, '#243346', centerX - 24, y - 8, 48, 24);
      pixel(context, description.venue === 'arcade' ? '#51dce1' : '#84a9a5', centerX - 19, y - 4, 38, 15);
      pixel(context, '#59606d', centerX - 29, y + 16, 58, 5);
      break;
    case 'phone':
      pixel(context, ink, centerX + 12, y - 12, 11, 20);
      pixel(context, '#6fd6d0', centerX + 14, y - 9, 7, 11);
      break;
    case 'sketching':
    case 'journaling':
      pixel(context, paper, centerX - 23, y, 45, 18);
      pixel(context, '#c95c54', centerX - 17, y + 5, 18, 2);
      pixel(context, ink, centerX + 7, y - 6, 4, 20);
      break;
    case 'knitting':
      pixel(context, '#d65978', centerX - 13, y + 2, 26, 14);
      pixel(context, '#f1cf82', centerX - 22, y - 8, 3, 24);
      pixel(context, '#f1cf82', centerX + 19, y - 8, 3, 24);
      break;
    case 'board-game':
      pixel(context, '#d5ad64', centerX - 25, y + 3, 50, 13);
      pixel(context, '#7d4c53', centerX - 13, y - 3, 8, 8);
      pixel(context, '#4b887d', centerX + 7, y - 4, 8, 9);
      break;
    case 'drinking':
    case 'tasting':
      pixel(context, '#ead9bb', centerX + 9, y - 5, 16, 16);
      pixel(context, '#9d5b48', centerX + 12, y - 2, 10, 4);
      pixel(context, '#ead9bb', centerX + 24, y, 5, 9);
      break;
    case 'machine':
      pixel(context, '#6d7680', centerX + 13, y - 4, 22, 23);
      pixel(context, '#f0c06e', centerX + 18, y, 10, 5);
      break;
    case 'serving':
      pixel(context, '#5b4b50', centerX + 2, y + 8, 39, 5);
      pixel(context, '#ead9bb', centerX + 13, y - 2, 15, 12);
      break;
    case 'wiping':
    case 'polishing':
      pixel(context, '#7bc8bd', centerX + 5, y + 4, 24, 12);
      break;
    case 'restocking':
      pixel(context, '#9b6747', centerX + 7, y, 26, 22);
      pixel(context, '#e4bb73', centerX + 11, y + 5, 18, 3);
      break;
    case 'grinding':
      pixel(context, '#6b5551', centerX + 8, y - 1, 21, 25);
      pixel(context, '#e2ad67', centerX + 13, y + 4, 11, 6);
      break;
    default:
      break;
  }
}

function drawSprite(context: PixelContext, description: SpriteDescription): void {
  context.clearRect(0, 0, DIORAMA.spriteWidth, DIORAMA.spriteHeight);
  context.imageSmoothingEnabled = false;
  const { palette, appearance, seated } = description;
  const center = DIORAMA.spriteWidth / 2;
  const bodyWidth = 43 + appearance.widthOffset * 3 + (appearance.body === 'broad' ? 7 : appearance.body === 'slim' ? -5 : 0);
  const headWidth = appearance.face === 'narrow' ? 33 : appearance.face === 'square' ? 41 : 37;
  const headHeight = appearance.face === 'round' ? 37 : 40;
  const headX = center - headWidth / 2;
  const nod = description.visual.gesture === 'nod' && (description.visual.frame === 1 || description.visual.frame === 2) ? 4 : 0;
  const headY = 19 + (seated ? 22 : 0) - appearance.heightOffset * 2 + nod;
  const shoulderY = headY + headHeight - 2;
  const torsoHeight = seated ? 48 : 60;
  const torsoX = center - bodyWidth / 2;
  const legTop = shoulderY + torsoHeight - 4;
  const skinDark = shade(palette.skin, -0.22);
  const coatDark = shade(palette.coat, -0.28);
  const coatLight = shade(palette.coat, 0.18);

  if (!seated) {
    const gait = description.visual.pose === 'walking' ? (description.visual.frame === 1 ? 5 : description.visual.frame === 3 ? -5 : 0) : 0;
    pixel(context, palette.trousers, center - 19 + gait, legTop, 15, 43);
    pixel(context, shade(palette.trousers, -0.2), center + 4 - gait, legTop, 15, 43);
    pixel(context, palette.shoes, center - 23 + gait, legTop + 37, 23, 10);
    pixel(context, palette.shoes, center + 3 - gait, legTop + 37, 23, 10);
  } else {
    pixel(context, palette.trousers, center - 22, legTop - 3, 20, 28);
    pixel(context, shade(palette.trousers, -0.2), center + 2, legTop - 3, 20, 28);
    pixel(context, palette.shoes, center - 25, legTop + 19, 21, 8);
    pixel(context, palette.shoes, center + 5, legTop + 19, 21, 8);
  }

  pixel(context, coatDark, torsoX - 2, shoulderY + 5, bodyWidth + 4, torsoHeight - 3);
  pixel(context, palette.coat, torsoX, shoulderY, bodyWidth, torsoHeight - 7);
  pixel(context, coatLight, torsoX + 5, shoulderY + 4, 7, torsoHeight - 15);
  if (appearance.outfit === 'cardigan' || appearance.outfit === 'jacket') {
    pixel(context, palette.accent, center - 3, shoulderY + 5, 6, torsoHeight - 11);
    for (let y = shoulderY + 14; y < shoulderY + torsoHeight - 8; y += 12) pixel(context, '#f0d3a3', center - 1, y, 3, 3);
  } else if (appearance.outfit === 'hoodie') {
    pixel(context, coatDark, center - 14, shoulderY - 3, 28, 11);
    pixel(context, palette.accent, center - 10, shoulderY + 12, 3, 24);
    pixel(context, palette.accent, center + 7, shoulderY + 12, 3, 24);
  } else if (appearance.outfit === 'overalls') {
    pixel(context, palette.accent, center - 15, shoulderY + 9, 30, torsoHeight - 15);
    pixel(context, '#f1d09b', center - 10, shoulderY + 17, 4, 4);
    pixel(context, '#f1d09b', center + 6, shoulderY + 17, 4, 4);
  } else if (appearance.outfit === 'dress') {
    pixel(context, palette.accent, torsoX - 5, shoulderY + torsoHeight - 22, bodyWidth + 10, 19);
  } else {
    pixel(context, palette.accent, torsoX + 3, shoulderY + 10, bodyWidth - 6, 7);
  }

  // Arme sind immer am Schultergelenk verankert. Die Hände enden am jeweiligen Requisit.
  const armY = shoulderY + 8;
  const handY = seated ? shoulderY + 48 : shoulderY + 38;
  const gestureLift = description.visual.frame === 1 || description.visual.frame === 2 ? 8 : 3;
  const poseMotion = ([0, -5, 0, 4] as const)[description.visual.frame];
  const activePose = description.visual.pose !== 'waiting';
  const baseLeftHandY = description.visual.pose === 'walking' ? handY + poseMotion : activePose ? handY + Math.min(0, poseMotion) : handY;
  const baseRightHandY = description.visual.pose === 'walking' ? handY - poseMotion : activePose ? handY - Math.max(0, poseMotion) : handY;
  const leftHandY = description.visual.gesture === 'wave' ? shoulderY - 13 + gestureLift : description.visual.gesture === 'compare' ? handY - 12 : baseLeftHandY;
  const rightHandY = description.visual.gesture === 'toast' || description.visual.gesture === 'swap' ? handY - 17
    : description.visual.gesture === 'startle' || description.visual.gesture === 'clean' ? handY - 12 : baseRightHandY;
  pixel(context, coatDark, torsoX - 10, Math.min(armY, leftHandY), 11, Math.abs(leftHandY - armY) + 9);
  pixel(context, palette.coat, torsoX - 8, Math.min(armY + 2, leftHandY), 8, Math.abs(leftHandY - armY) + 4);
  pixel(context, coatDark, torsoX + bodyWidth - 1, Math.min(armY, rightHandY), 11, Math.abs(rightHandY - armY) + 9);
  pixel(context, palette.coat, torsoX + bodyWidth, Math.min(armY + 2, rightHandY), 8, Math.abs(rightHandY - armY) + 4);
  pixel(context, skinDark, torsoX - 9, leftHandY, 11, 10);
  pixel(context, palette.skin, torsoX + bodyWidth - 1, rightHandY, 11, 10);

  face(context, description, headX, headY + 4, headWidth, headHeight);
  hair(context, description, headX, headY, headWidth);
  pixel(context, skinDark, center - 7, shoulderY - 6, 14, 9);

  if (appearance.detail === 'hairclip') pixel(context, '#f0c766', headX + headWidth - 6, headY + 7, 7, 4);
  if (description.regular) {
    pixel(context, '#f2ca74', torsoX - 5, shoulderY + 12, 4, 14);
    pixel(context, '#fff1b2', torsoX - 4, shoulderY + 14, 2, 5);
  }
  if (description.barista) {
    pixel(context, '#e8d7b6', center - 16, shoulderY + 15, 32, torsoHeight - 18);
    pixel(context, shade(palette.accent, -0.15), center - 3, shoulderY + 15, 6, torsoHeight - 18);
    if (description.venue === 'ramen') pixel(context, '#f2e2c3', headX - 3, headY - 8, headWidth + 6, 9);
  }
  if (description.accessory === 'scarf') pixel(context, palette.accent, center - 20, shoulderY - 1, 40, 10);
  if (description.accessory === 'coat') pixel(context, shade(palette.coat, -0.12), torsoX - 5, shoulderY + 5, 8, torsoHeight - 4);
  if (description.accessory === 'sunglasses') pixel(context, '#242431', headX + 4, headY + 16, headWidth - 8, 6);
  if (description.accessory === 'umbrella') {
    pixel(context, '#e0bb70', torsoX - 15, shoulderY + 15, 3, 74);
    pixel(context, '#4a5260', torsoX - 35, shoulderY + 12, 42, 5);
  }

  activityProp(context, description, center, seated ? shoulderY + 49 : shoulderY + 43);
}

function configureTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function spriteKey(description: SpriteDescription): string {
  return [description.venue, description.palette.skin, description.palette.hair, description.palette.coat,
    description.palette.accent, description.palette.trousers, description.palette.shoes,
    description.appearance.body, description.appearance.face, description.appearance.hair,
    description.appearance.outfit, description.appearance.detail, description.appearance.maturity,
    description.seated, description.activity, description.accessory, description.regular, description.barista,
    description.visual.frame, description.visual.expression, description.visual.gesture].join('|');
}

interface DisposableTexture {
  dispose(): void;
}

interface TextureCacheEntry<T extends DisposableTexture> {
  readonly value: T;
  lastUsedFrame: number;
  active: boolean;
}

/** LRU bounded by inactive entries; textures touched in the current frame are protected. */
export class FrameTextureCache<T extends DisposableTexture> {
  private readonly entries = new Map<string, TextureCacheEntry<T>>();
  private frame = 0;

  constructor(readonly maxInactiveEntries = 192) {}

  get size(): number {
    return this.entries.size;
  }

  get inactiveSize(): number {
    return [...this.entries.values()].filter((entry) => !entry.active).length;
  }

  beginFrame(): void {
    this.frame += 1;
    for (const entry of this.entries.values()) entry.active = false;
  }

  getOrCreate(key: string, create: () => T): T {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: create(), lastUsedFrame: this.frame, active: true };
      this.entries.set(key, entry);
    }
    entry.lastUsedFrame = this.frame;
    entry.active = true;
    return entry.value;
  }

  endFrame(): void {
    const inactive = [...this.entries.entries()]
      .filter(([, entry]) => !entry.active)
      .sort(([, left], [, right]) => left.lastUsedFrame - right.lastUsedFrame);
    const removeCount = Math.max(0, inactive.length - Math.max(0, this.maxInactiveEntries));
    for (const [key, entry] of inactive.slice(0, removeCount)) {
      entry.value.dispose();
      this.entries.delete(key);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.value.dispose();
    this.entries.clear();
  }
}

export class SpriteTextureLibrary {
  private readonly textures = new FrameTextureCache<CanvasTexture>(192);

  get cacheSize(): number {
    return this.textures.size;
  }

  get inactiveCacheSize(): number {
    return this.textures.inactiveSize;
  }

  beginFrame(): void {
    this.textures.beginFrame();
  }

  endFrame(): void {
    this.textures.endFrame();
  }

  forGuest(guest: Guest, venue: VenueKind, visual: CharacterVisualState): Texture {
    return this.texture({
      palette: guest.palette,
      appearance: guest.appearance,
      seated: guest.state === 'activity',
      activity: visual.pose,
      accessory: guest.accessory,
      regular: Boolean(guest.regularId),
      venue,
      barista: false,
      visual,
    });
  }

  forBarista(_barista: Barista, venue: VenueKind, visual: CharacterVisualState): Texture {
    return this.texture({
      palette: BARISTA_PALETTES[venue],
      appearance: BARISTA_APPEARANCE,
      seated: false,
      activity: visual.pose,
      regular: false,
      venue,
      barista: true,
      visual,
    });
  }

  dispose(): void {
    this.textures.clear();
  }

  private texture(description: SpriteDescription): CanvasTexture {
    const key = spriteKey(description);
    return this.textures.getOrCreate(key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = DIORAMA.spriteWidth;
      canvas.height = DIORAMA.spriteHeight;
      const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
      if (!context) throw new Error('Pixelsprites können in diesem Browser nicht erzeugt werden.');
      drawSprite(context, description);
      const texture = configureTexture(canvas);
      texture.name = `character:${key}`;
      return texture;
    });
  }
}

// Verhindert, dass TypeScript die moderne Canvas-Farboption als ungenutzt zurückstuft.
void NoColorSpace;
