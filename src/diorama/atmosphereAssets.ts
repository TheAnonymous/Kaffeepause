import {
  ClampToEdgeWrapping,
  NearestFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import type { AtmosphereAssetState } from '../atmosphere/types';
import type { VenueKind } from '../venue';

export interface AtmosphereAtlasRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AtmosphereAtlasManifest {
  readonly src: string;
  readonly width: 544;
  readonly height: 272;
  readonly bytes: number;
  readonly regions: readonly AtmosphereAtlasRegion[];
}

export interface AtmosphereArtPack {
  readonly venue: VenueKind;
  readonly state: Extract<AtmosphereAssetState, 'ready' | 'partial'>;
  readonly textureBytes: number;
  readonly layers: readonly ('shared' | 'venue')[];
  textureForRegion(layer: 'shared' | 'venue', id: string): Texture | undefined;
  dispose(): void;
}

const region = (id: string, slot: number): AtmosphereAtlasRegion => ({
  id,
  x: (slot % 4) * 136 + 4,
  y: Math.floor(slot / 4) * 136 + 4,
  width: 128,
  height: 128,
});

export const SHARED_ATMOSPHERE_ATLAS: AtmosphereAtlasManifest = Object.freeze({
  src: './art/v5/shared/atmosphere-atlas.webp', width: 544, height: 272, bytes: 28_426,
  regions: Object.freeze([
    region('city', 0), region('pedestrian', 1), region('traffic', 2), region('rain-reflection', 3),
    region('wind', 4), region('thunder', 5), region('snow', 6), region('fog', 7),
  ]),
});

const VENUE_BYTES: Readonly<Record<VenueKind, number>> = { cafe: 30_072, ramen: 17_266, arcade: 12_120 };

export const VENUE_ATMOSPHERE_ATLASES: Readonly<Record<VenueKind, AtmosphereAtlasManifest>> = Object.freeze(
  Object.fromEntries((['cafe', 'ramen', 'arcade'] as const).map((venue) => [venue, Object.freeze({
    src: `./art/v5/venues/${venue}-atlas.webp`, width: 544 as const, height: 272 as const, bytes: VENUE_BYTES[venue],
    regions: Object.freeze([
      region('signature-primary', 0), region('signature-accent', 1), region('window-reflection', 2), region('sunbreak', 3),
      region('venue-silhouette', 4), region('practical-light', 5), region('interior-detail', 6), region('floor-reflection', 7),
    ]),
  })])) as Record<VenueKind, AtmosphereAtlasManifest>,
);

export interface AtmosphereArtBudgetReport {
  readonly valid: boolean;
  readonly totalBytes: number;
  readonly maximumActiveBytes: number;
}

export function validateAtmosphereArtBudgets(): AtmosphereArtBudgetReport {
  const venueBytes = Object.values(VENUE_ATMOSPHERE_ATLASES).map((atlas) => atlas.bytes);
  const totalBytes = SHARED_ATMOSPHERE_ATLAS.bytes + venueBytes.reduce((total, bytes) => total + bytes, 0);
  const maximumActiveBytes = SHARED_ATMOSPHERE_ATLAS.bytes + Math.max(...venueBytes);
  return { valid: totalBytes <= 4_000_000 && maximumActiveBytes <= 1_500_000, totalBytes, maximumActiveBytes };
}

function configure(texture: Texture, name: string): Texture {
  texture.name = name;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function hasExpectedDimensions(texture: Texture, manifest: AtmosphereAtlasManifest): boolean {
  const image = texture.image as { width?: unknown; height?: unknown } | undefined;
  return image === undefined || (image.width === manifest.width && image.height === manifest.height);
}

class LoadedAtmosphereArtPack implements AtmosphereArtPack {
  private readonly regionTextures = new Map<string, Texture>();
  private disposed = false;

  constructor(
    readonly venue: VenueKind,
    private readonly shared?: Texture,
    private readonly venueTexture?: Texture,
  ) {}

  get state(): 'ready' | 'partial' { return this.shared && this.venueTexture ? 'ready' : 'partial'; }
  get textureBytes(): number {
    return (this.shared ? SHARED_ATMOSPHERE_ATLAS.bytes : 0)
      + (this.venueTexture ? VENUE_ATMOSPHERE_ATLASES[this.venue].bytes : 0);
  }
  get layers(): readonly ('shared' | 'venue')[] {
    return [...(this.shared ? ['shared' as const] : []), ...(this.venueTexture ? ['venue' as const] : [])];
  }

  textureForRegion(layer: 'shared' | 'venue', id: string): Texture | undefined {
    if (this.disposed) return undefined;
    const atlas = layer === 'shared' ? SHARED_ATMOSPHERE_ATLAS : VENUE_ATMOSPHERE_ATLASES[this.venue];
    const source = layer === 'shared' ? this.shared : this.venueTexture;
    const target = atlas.regions.find((entry) => entry.id === id);
    if (!source || !target) return undefined;
    const key = `${layer}:${id}`;
    const cached = this.regionTextures.get(key);
    if (cached) return cached;
    const texture = source.clone();
    texture.offset.set(target.x / atlas.width, 1 - (target.y + target.height) / atlas.height);
    texture.repeat.set(target.width / atlas.width, target.height / atlas.height);
    configure(texture, `v5-atmosphere:${this.venue}:${key}`);
    this.regionTextures.set(key, texture);
    return texture;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.regionTextures.values()) texture.dispose();
    this.regionTextures.clear();
    this.shared?.dispose();
    this.venueTexture?.dispose();
  }
}

type TextureLoad = (src: string) => Promise<Texture>;

export class AtmosphereArtLoader {
  state: AtmosphereAssetState = 'procedural';
  private generation = 0;

  constructor(private readonly loadTexture: TextureLoad = async (src) => configure(await new TextureLoader().loadAsync(src), src)) {}

  cancel(): void {
    this.generation += 1;
    this.state = 'procedural';
  }

  async load(venue: VenueKind): Promise<AtmosphereArtPack | undefined> {
    const request = ++this.generation;
    this.state = 'loading';
    const venueManifest = VENUE_ATMOSPHERE_ATLASES[venue];
    const [sharedResult, venueResult] = await Promise.allSettled([
      this.loadTexture(SHARED_ATMOSPHERE_ATLAS.src),
      this.loadTexture(venueManifest.src),
    ]);
    const shared = sharedResult.status === 'fulfilled' && hasExpectedDimensions(sharedResult.value, SHARED_ATMOSPHERE_ATLAS)
      ? sharedResult.value : undefined;
    const venueTexture = venueResult.status === 'fulfilled' && hasExpectedDimensions(venueResult.value, venueManifest)
      ? venueResult.value : undefined;
    if (sharedResult.status === 'fulfilled' && sharedResult.value !== shared) sharedResult.value.dispose();
    if (venueResult.status === 'fulfilled' && venueResult.value !== venueTexture) venueResult.value.dispose();
    if (request !== this.generation) {
      shared?.dispose();
      venueTexture?.dispose();
      return undefined;
    }
    if (!shared && !venueTexture) {
      this.state = 'failed';
      return undefined;
    }
    const pack = new LoadedAtmosphereArtPack(venue, shared, venueTexture);
    this.state = pack.state;
    return pack;
  }
}

export const ATMOSPHERE_ART_BUDGET_REPORT = validateAtmosphereArtBudgets();
