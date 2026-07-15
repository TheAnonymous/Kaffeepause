import { describe, expect, it, vi } from 'vitest';
import { Texture } from 'three';
import {
  VENUE_ART_BUDGET_REPORT,
  VENUE_ART_MANIFEST_REPORTS,
  VENUE_ART_MANIFESTS,
  VenueArtPackLoader,
  validatePixelAtlas,
} from '../src/diorama/artAssets';
import { buildVenue } from '../src/diorama/venueBuilder';
import { decorateVenueWithArtPack } from '../src/diorama/venueArtDecorator';

function texture(width: number, height: number): Texture {
  const result = new Texture();
  result.image = { width, height };
  return result;
}

describe('V3-Art-Manifeste', () => {
  it('hält alle Regionen samt 4-Pixel-Gutter, Ankern, Figurenposen und Venue-Rollen gültig', () => {
    expect(VENUE_ART_BUDGET_REPORT).toMatchObject({ valid: true });
    expect(VENUE_ART_BUDGET_REPORT.totalBytes).toBeLessThan(4_000_000);
    expect(VENUE_ART_BUDGET_REPORT.maximumActiveBytes).toBeLessThan(1_500_000);
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      expect(VENUE_ART_MANIFEST_REPORTS[venue]).toEqual({ valid: true, issues: [] });
      expect(validatePixelAtlas(VENUE_ART_MANIFESTS[venue].shared)).toEqual([]);
      expect(validatePixelAtlas(VENUE_ART_MANIFESTS[venue].venueAtlas)).toEqual([]);
    }
  });

  it('meldet überlaufende Regionen und ungültige Fußpunktanker', () => {
    expect(validatePixelAtlas({
      src: 'broken.webp', width: 64, height: 64, bytes: 1,
      regions: [{ id: 'broken', x: 1, y: 1, width: 64, height: 64, gutter: 4, role: 'character', anchor: { x: 2, y: -1 } }],
    })).toEqual(['bounds:broken', 'anchor:broken']);
  });
});

describe('asynchroner Art-Pack-Lader', () => {
  it('lädt nur Shared- plus aktives Venuepaket und gibt Atlas, Regionen und Ressourcen frei', async () => {
    const disposed: string[] = [];
    const loader = new VenueArtPackLoader(async (src) => {
      const manifest = VENUE_ART_MANIFESTS.cafe;
      const atlas = src.includes('shared') ? manifest.shared : manifest.venueAtlas;
      const result = texture(atlas.width, atlas.height);
      result.dispose = () => { disposed.push(src); };
      return result;
    });
    const pack = await loader.load('cafe');
    expect(loader.state).toBe('ready');
    expect(pack).toMatchObject({ venue: 'cafe', id: 'v3-cafe-filmic-density', disposed: false });
    expect(pack?.textureForRegion('character-standing')).toBeDefined();
    expect(pack?.textureForRegion('surface-wood')).toBeDefined();
    pack?.dispose();
    expect(pack?.disposed).toBe(true);
    expect(disposed).toHaveLength(2);
    expect(pack?.textureForRegion('surface-wood')).toBeUndefined();
  });

  it('fällt bei 404/Dekodierfehler vollständig auf prozedural zurück und entsorgt Teilerfolge', async () => {
    const dispose = vi.fn();
    let call = 0;
    const loader = new VenueArtPackLoader(async () => {
      call += 1;
      if (call === 2) throw new Error('404');
      const result = texture(1584, 264);
      result.dispose = dispose;
      return result;
    });
    expect(await loader.load('ramen')).toBeUndefined();
    expect(loader.state).toBe('failed');
    expect(loader.lastError?.message).toBe('404');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('verwirft veraltete Ladevorgänge bei einem schnellen Ortswechsel', async () => {
    const pending: Array<(texture: Texture) => void> = [];
    const disposed = vi.fn();
    const loader = new VenueArtPackLoader(() => new Promise<Texture>((resolve) => pending.push(resolve)));
    const cafe = loader.load('cafe');
    const ramen = loader.load('ramen');
    expect(pending).toHaveLength(4);
    for (const index of [0, 1]) {
      const atlas = index === 0 ? VENUE_ART_MANIFESTS.cafe.shared : VENUE_ART_MANIFESTS.cafe.venueAtlas;
      const result = texture(atlas.width, atlas.height);
      result.dispose = disposed;
      pending[index]?.(result);
    }
    expect(await cafe).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(2);
    for (const index of [2, 3]) {
      const atlas = index === 2 ? VENUE_ART_MANIFESTS.ramen.shared : VENUE_ART_MANIFESTS.ramen.venueAtlas;
      pending[index]?.(texture(atlas.width, atlas.height));
    }
    expect(await ramen).toMatchObject({ venue: 'ramen' });
  });

  it('dekoriert Materialien und Requisiten, ohne den prozeduralen Venue-Baum zu ersetzen', async () => {
    const loader = new VenueArtPackLoader(async (src) => {
      const manifest = VENUE_ART_MANIFESTS.arcade;
      const atlas = src.includes('shared') ? manifest.shared : manifest.venueAtlas;
      return texture(atlas.width, atlas.height);
    });
    const pack = await loader.load('arcade');
    const venue = buildVenue('arcade');
    if (!pack) throw new Error('pack');
    const decoration = decorateVenueWithArtPack(venue, pack);
    expect(venue.root.children).toContain(decoration.root);
    expect(decoration.drawCalls).toBeLessThanOrEqual(4);
    expect([...venue.surfaceMaterials.values()].flat().some((material) => material.bumpMap)).toBe(true);
    decoration.dispose();
    expect(decoration.root.parent).toBeNull();
    pack.dispose();
    venue.dispose();
  });
});
