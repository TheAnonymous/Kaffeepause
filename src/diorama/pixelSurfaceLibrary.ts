import {
  CanvasTexture,
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
    for (let index = 0; index < size * 1.4; index += 1) {
      context.fillRect(Math.floor(seeded(index, 1) * size), Math.floor(seeded(index, 2) * size), index % 4 === 0 ? 2 : 1, 1);
    }
  } else if (recipe.kind === 'wood') {
    for (let y = 3; y < size; y += 4) context.fillRect(0, y, size, 1);
    context.fillRect(3, 2, 1, 5);
    context.fillRect(size - 5, size - 6, 2, 3);
  } else if (recipe.kind === 'tile' || recipe.kind === 'floor') {
    const cell = recipe.kind === 'tile' ? 8 : 6;
    for (let value = 0; value < size; value += cell) {
      context.fillRect(value, 0, 1, size);
      context.fillRect(0, value, size, 1);
    }
  } else if (recipe.kind === 'metal') {
    for (let x = 1; x < size; x += 4) context.fillRect(x, 0, 1, size);
    context.fillStyle = recipe.highlight;
    context.fillRect(Math.floor(size * 0.62), 0, 2, size);
  } else if (recipe.kind === 'glass') {
    for (let offset = -size; offset < size * 2; offset += 7) {
      context.fillRect(offset, 0, 2, 2);
      context.fillRect(offset + 2, 2, 2, 2);
      context.fillRect(offset + 4, 4, 2, 2);
    }
  } else {
    context.fillRect(0, size - 3, size, 1);
    context.fillRect(3, 3, size - 6, 1);
  }

  context.fillStyle = recipe.highlight;
  if (recipe.kind !== 'metal') {
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
