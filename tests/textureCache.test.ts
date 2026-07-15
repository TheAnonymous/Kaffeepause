import { describe, expect, it } from 'vitest';
import { FrameTextureCache } from '../src/diorama/spriteFactory';
import { Texture } from 'three';
import { PixelSurfaceLibrary } from '../src/diorama/pixelSurfaceLibrary';
import { VENUE_VISUAL_PROFILES } from '../src/diorama/visualProfiles';

describe('Figurentextur-Cache', () => {
  it('begrenzt inaktive Einträge auf 192 und entsorgt nie aktive Texturen', () => {
    const disposed = new Set<number>();
    const cache = new FrameTextureCache<{ dispose(): void }>(192);
    cache.beginFrame();
    for (let index = 0; index < 200; index += 1) cache.getOrCreate(String(index), () => ({ dispose: () => disposed.add(index) }));
    cache.endFrame();
    expect(cache.size).toBe(200);
    expect(cache.inactiveSize).toBe(0);

    cache.beginFrame();
    cache.getOrCreate('198', () => ({ dispose: () => disposed.add(198) }));
    cache.getOrCreate('199', () => ({ dispose: () => disposed.add(199) }));
    cache.endFrame();
    expect(cache.inactiveSize).toBe(192);
    expect(cache.size).toBe(194);
    expect(disposed.size).toBe(6);
    expect(disposed.has(198)).toBe(false);
    expect(disposed.has(199)).toBe(false);
  });
});

describe('PixelSurfaceLibrary', () => {
  it('cached jede Rezepttextur genau einmal und gibt beim Venuewechsel alle GPU-Ressourcen frei', () => {
    const disposed: string[] = [];
    const created: string[] = [];
    const library = new PixelSurfaceLibrary(VENUE_VISUAL_PROFILES.cafe.surfaces, (recipe) => {
      const texture = new Texture();
      texture.name = recipe.kind;
      texture.dispose = () => { disposed.push(recipe.kind); };
      created.push(recipe.kind);
      return texture;
    });
    expect(library.get('wood')).toBe(library.get('wood'));
    library.get('glass');
    library.get('floor');
    expect(created).toEqual(['wood', 'glass', 'floor']);
    expect(library.size).toBe(3);
    library.dispose();
    library.dispose();
    expect(disposed.sort()).toEqual(['floor', 'glass', 'wood']);
    expect(library.size).toBe(0);
    expect(library.isDisposed).toBe(true);
    expect(() => library.get('wood')).toThrow(/freigegeben/);
  });
});
