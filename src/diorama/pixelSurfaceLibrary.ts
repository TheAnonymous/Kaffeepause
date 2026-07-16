import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { SurfaceKind, SurfaceRecipe } from './visualProfiles';

type SurfaceTextureFactory = (recipe: Readonly<SurfaceRecipe>) => Texture;

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 17.13 + salt * 71.91) * 43_758.5453;
  return value - Math.floor(value);
}

function drawRecipe(context: CanvasRenderingContext2D, recipe: Readonly<SurfaceRecipe>): void {
  const size = recipe.size;
  context.imageSmoothingEnabled = false;
  context.fillStyle = recipe.base;
  context.fillRect(0, 0, size, size);
  context.fillStyle = recipe.detail;

  if (recipe.kind === 'plaster') {
    for (let index = 0; index < Math.floor(size * 0.7); index += 1) {
      const x = Math.floor(seeded(index, 1) * (size - 4));
      const y = Math.floor(seeded(index, 2) * (size - 2));
      context.fillRect(x, y, index % 5 === 0 ? 3 : 1, 1);
    }
    context.fillRect(2, size - 5, 5, 1);
    context.fillRect(size - 9, 6, 6, 1);
  } else if (recipe.kind === 'wood') {
    const board = 8;
    for (let y = board - 1; y < size; y += board) context.fillRect(0, y, size, 1);
    for (let row = 0; row < size / board; row += 1) {
      const seam = (row % 2 === 0 ? 11 : 23) % size;
      context.fillRect(seam, row * board, 1, board);
      context.fillRect((seam + 14) % size, row * board + 3, 5, 1);
    }
    context.fillStyle = recipe.highlight;
    context.fillRect(2, 1, 12, 1);
    context.fillRect(18, 17, 7, 1);
    context.fillRect(27, 25, 2, 2);
  } else if (recipe.kind === 'tile') {
    const cell = 8;
    for (let value = 0; value < size; value += cell) {
      context.fillRect(value, 0, 1, size);
      context.fillRect(0, value, size, 1);
    }
    context.fillStyle = recipe.highlight;
    for (let y = 1; y < size; y += cell) for (let x = 1; x < size; x += cell) context.fillRect(x, y, 4, 1);
  } else if (recipe.kind === 'floor') {
    const row = 8;
    for (let y = row - 1; y < size; y += row) context.fillRect(0, y, size, 1);
    for (let y = 0; y < size; y += row) {
      const offset = (y / row) % 2 === 0 ? 0 : 8;
      for (let x = offset; x < size; x += 16) context.fillRect(x, y, 1, row);
    }
    context.fillStyle = recipe.highlight;
    context.fillRect(3, 2, 7, 1);
    context.fillRect(19, 18, 8, 1);
    context.fillRect(11, 27, 3, 1);
  } else if (recipe.kind === 'metal') {
    for (let y = 2; y < size; y += 5) context.fillRect(0, y, size, 1);
    context.fillStyle = recipe.highlight;
    context.fillRect(Math.floor(size * 0.62), 0, 1, size);
    context.fillRect(3, 7, 10, 1);
    context.fillRect(22, 23, 7, 1);
  } else if (recipe.kind === 'glass') {
    for (let index = 0; index < 7; index += 1) {
      const x = 2 + Math.floor(seeded(index, 8) * (size - 5));
      const y = Math.floor(seeded(index, 9) * 8);
      const length = 4 + (index % 4) * 3;
      context.fillRect(x, y, 1, length);
      if (index % 2 === 0) context.fillRect(x + 1, y + length - 1, 1, 3);
    }
  } else {
    context.fillRect(0, size - 3, size, 1);
    context.fillRect(3, 3, size - 6, 1);
  }

  context.fillStyle = recipe.highlight;
  if (!['metal', 'wood', 'tile', 'floor'].includes(recipe.kind)) {
    context.fillRect(1, 1, Math.max(1, Math.floor(size / 3)), 1);
    context.fillRect(size - 3, size - 3, 1, 1);
  }
}

export function createPixelSurfaceTexture(recipe: Readonly<SurfaceRecipe>): Texture {
  if (typeof document === 'undefined') {
    const pixels = new Uint8Array(recipe.size * recipe.size * 4);
    for (let index = 0; index < recipe.size * recipe.size; index += 1) {
      const detail = index % Math.max(2, Math.floor(recipe.size / 2)) === 0;
      const hex = (detail ? recipe.detail : recipe.base).replace('#', '');
      pixels[index * 4] = Number.parseInt(hex.slice(0, 2), 16);
      pixels[index * 4 + 1] = Number.parseInt(hex.slice(2, 4), 16);
      pixels[index * 4 + 2] = Number.parseInt(hex.slice(4, 6), 16);
      pixels[index * 4 + 3] = 255;
    }
    const fallback = new DataTexture(pixels, recipe.size, recipe.size, RGBAFormat);
    fallback.name = `surface:${recipe.kind}:test-fallback`;
    fallback.magFilter = NearestFilter;
    fallback.minFilter = NearestFilter;
    fallback.wrapS = RepeatWrapping;
    fallback.wrapT = RepeatWrapping;
    fallback.repeat.set(...recipe.repeat);
    fallback.colorSpace = SRGBColorSpace;
    fallback.generateMipmaps = false;
    fallback.needsUpdate = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = recipe.size;
  canvas.height = recipe.size;
  const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (!context) throw new Error('Oberflächentexturen können in diesem Browser nicht erzeugt werden.');
  drawRecipe(context, recipe);
  const texture = new CanvasTexture(canvas);
  texture.name = `surface:${recipe.kind}`;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...recipe.repeat);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function lightPoolAlpha(x: number, y: number, width: number, height: number): number {
  const nx = Math.abs((x + 0.5) / width * 2 - 1);
  const ny = Math.abs((y + 0.5) / height * 2 - 1);
  const stepped = Math.ceil((nx * 0.72 + ny) * 8) / 8;
  if (stepped >= 1) return 0;
  if (stepped < 0.28) return 205;
  if (stepped < 0.48) return 138;
  if (stepped < 0.7) return (x + y) % 4 === 0 ? 92 : 62;
  return (x * 3 + y * 5) % 7 === 0 ? 44 : 0;
}

/** A stepped, dithered reflection mask that keeps practical light visibly pixel-authored. */
export function createPixelLightPoolTexture(width = 64, height = 48): Texture {
  if (typeof document === 'undefined') {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        pixels[index] = 255;
        pixels[index + 1] = 255;
        pixels[index + 2] = 255;
        pixels[index + 3] = lightPoolAlpha(x, y, width, height);
      }
    }
    const fallback = new DataTexture(pixels, width, height, RGBAFormat);
    fallback.name = 'light-pool:test-fallback';
    fallback.magFilter = NearestFilter;
    fallback.minFilter = NearestFilter;
    fallback.colorSpace = SRGBColorSpace;
    fallback.generateMipmaps = false;
    fallback.needsUpdate = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
  if (!context) throw new Error('Pixellicht kann in diesem Browser nicht erzeugt werden.');
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = lightPoolAlpha(x, y, width, height);
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.name = 'light-pool:authored-pixel-mask';
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Venue-scoped cache. The owning DioramaSet disposes it completely on a venue switch. */
export class PixelSurfaceLibrary {
  private readonly textures = new Map<SurfaceKind, Texture>();
  private disposed = false;

  constructor(
    private readonly recipes: Readonly<Record<SurfaceKind, SurfaceRecipe>>,
    private readonly createTexture: SurfaceTextureFactory = createPixelSurfaceTexture,
  ) {}

  get size(): number {
    return this.textures.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get(kind: SurfaceKind): Texture {
    if (this.disposed) throw new Error('Die Oberflächenbibliothek wurde bereits freigegeben.');
    let texture = this.textures.get(kind);
    if (!texture) {
      texture = this.createTexture(this.recipes[kind]);
      this.textures.set(kind, texture);
    }
    return texture;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.disposed = true;
  }
}
