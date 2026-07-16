import { describe, expect, it } from 'vitest';
import { CharacterTextureCache } from '../src/diorama/spriteFactory';
import { Texture } from 'three';
import { PixelSurfaceLibrary } from '../src/diorama/pixelSurfaceLibrary';
import { VENUE_VISUAL_PROFILES } from '../src/diorama/visualProfiles';

describe('Figurentextur-Cache', () => {
  it('begrenzt jede Identität auf acht Varianten und den Gesamtcache auf 64 Texturen', () => {
    const disposed = new Set<string>();
    const cache = new CharacterTextureCache<{ dispose(): void }>(8, 64, 128 * 128 * 4);
    for (let identity = 0; identity < 9; identity += 1) {
      for (let variant = 0; variant < 9; variant += 1) {
        const key = `${identity}:${variant}`;
        cache.getOrCreate(String(identity), String(variant), () => ({ dispose: () => disposed.add(key) }));
      }
    }
    expect(cache.stats).toMatchObject({
      textures: 64,
      identities: 8,
      maximumTextures: 64,
      maximumVariantsPerIdentity: 8,
      rawPixelBytes: 64 * 128 * 128 * 4,
    });
    expect(disposed.size).toBe(17);
  });

  it('entsorgt beim Verlassen einer Figur sofort ausschließlich deren Varianten', () => {
    const disposed: string[] = [];
    const cache = new CharacterTextureCache<{ dispose(): void }>();
    cache.getOrCreate('guest-a', 'idle', () => ({ dispose: () => disposed.push('a-idle') }));
    cache.getOrCreate('guest-a', 'walk', () => ({ dispose: () => disposed.push('a-walk') }));
    cache.getOrCreate('guest-b', 'idle', () => ({ dispose: () => disposed.push('b-idle') }));
    cache.releaseIdentity('guest-a');
    expect(disposed.sort()).toEqual(['a-idle', 'a-walk']);
    expect(cache.stats).toMatchObject({ textures: 1, identities: 1 });
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
