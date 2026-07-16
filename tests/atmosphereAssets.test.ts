import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ATMOSPHERE_ART_BUDGET_REPORT,
  AtmosphereArtLoader,
  SHARED_ATMOSPHERE_ATLAS,
  VENUE_ATMOSPHERE_ATLASES,
} from '../src/diorama/atmosphereAssets';

function texture(width = 544, height = 272): Texture {
  const result = new Texture();
  result.image = { width, height };
  return result;
}

describe('V5-Atmosphärenassets', () => {
  it('hält vier Atlanten, 4×2-Zellen und aktive Grafikbudgets ein', () => {
    expect(ATMOSPHERE_ART_BUDGET_REPORT).toMatchObject({ valid: true });
    expect(SHARED_ATMOSPHERE_ATLAS.regions).toHaveLength(8);
    for (const atlas of Object.values(VENUE_ATMOSPHERE_ATLASES)) {
      expect(atlas).toMatchObject({ width: 544, height: 272 });
      expect(atlas.regions).toHaveLength(8);
      for (const entry of atlas.regions) {
        expect(entry.x).toBeGreaterThanOrEqual(4);
        expect(entry.y).toBeGreaterThanOrEqual(4);
        expect(entry.x + entry.width).toBeLessThanOrEqual(540);
        expect(entry.y + entry.height).toBeLessThanOrEqual(268);
      }
    }
  });

  it('lädt Shared und Venue unabhängig und meldet partielle Fallbacks', async () => {
    let call = 0;
    const loader = new AtmosphereArtLoader(async () => {
      call += 1;
      if (call === 2) throw new Error('venue-404');
      return texture();
    });
    const pack = await loader.load('cafe');
    expect(pack).toMatchObject({ state: 'partial', layers: ['shared'] });
    expect(loader.state).toBe('partial');
    expect(pack?.textureForRegion('shared', 'city')).toBeDefined();
    expect(pack?.textureForRegion('venue', 'signature-primary')).toBeUndefined();
    pack?.dispose();
  });

  it('fällt bei beiden Fehlern rein prozedural zurück und verwirft falsche Dimensionen einzeln', async () => {
    const failed = new AtmosphereArtLoader(async () => { throw new Error('404'); });
    expect(await failed.load('ramen')).toBeUndefined();
    expect(failed.state).toBe('failed');
    const disposed = vi.fn();
    let call = 0;
    const partial = new AtmosphereArtLoader(async () => {
      call += 1;
      const result = call === 1 ? texture(512, 256) : texture();
      result.dispose = disposed;
      return result;
    });
    expect(await partial.load('arcade')).toMatchObject({ state: 'partial', layers: ['venue'] });
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('entsorgt Teilergebnisse eines überholten Venuewechsels', async () => {
    const pending: Array<(value: Texture) => void> = [];
    const disposed = vi.fn();
    const loader = new AtmosphereArtLoader(() => new Promise((resolve) => pending.push(resolve)));
    const cafe = loader.load('cafe');
    const ramen = loader.load('ramen');
    for (const resolve of pending) {
      const result = texture();
      result.dispose = disposed;
      resolve(result);
    }
    expect(await cafe).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(2);
    expect(await ramen).toMatchObject({ state: 'ready', layers: ['shared', 'venue'] });
  });
});
