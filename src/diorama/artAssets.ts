import {
  ClampToEdgeWrapping,
  NearestFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import type { VenueKind } from '../venue';

export type ArtAssetState = 'procedural' | 'loading' | 'ready' | 'failed';
export type PixelAtlasRole = 'character' | 'surface' | 'prop' | 'foreground' | 'emission';

export interface PixelAtlasRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly role: PixelAtlasRole;
  readonly gutter: number;
}

export interface PixelAtlasManifest {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly regions: readonly PixelAtlasRegion[];
}

export interface VenueArtManifest {
  readonly id: string;
  readonly venue: VenueKind;
  readonly shared: PixelAtlasManifest;
  readonly venueAtlas: PixelAtlasManifest;
}

export interface LoadedVenueArtPack {
  readonly id: string;
  readonly venue: VenueKind;
  readonly manifest: VenueArtManifest;
  readonly sharedTexture: Texture;
  readonly venueTexture: Texture;
  readonly textureBytes: number;
  readonly disposed: boolean;
  region(id: string): PixelAtlasRegion | undefined;
  textureForRegion(id: string): Texture | undefined;
  dispose(): void;
}

export interface VenueArtBudgetReport {
  readonly valid: boolean;
  readonly totalBytes: number;
  readonly maximumActiveBytes: number;
  readonly issues: readonly string[];
}

export interface VenueArtManifestReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

const CHARACTER_REGION_IDS = [
  'character-standing',
  'character-seated',
  'character-walking',
  'character-reaching',
  'character-holding',
  'character-reacting',
] as const;

const sharedRegion = (id: typeof CHARACTER_REGION_IDS[number], column: number): PixelAtlasRegion => ({
  id,
  x: column * 264 + 4,
  y: 4,
  width: 256,
  height: 256,
  anchor: { x: 0.5, y: 1 },
  role: 'character',
  gutter: 4,
});

const SHARED_ATLAS: PixelAtlasManifest = Object.freeze({
  src: './art/v3/shared/character-atlas.webp',
  width: 1584,
  height: 264,
  bytes: 152_054,
  regions: Object.freeze(CHARACTER_REGION_IDS.map(sharedRegion)),
});

const venueRegion = (
  id: string,
  slot: number,
  role: Exclude<PixelAtlasRole, 'character'>,
  anchor: Readonly<{ x: number; y: number }> = { x: 0.5, y: 0.5 },
): PixelAtlasRegion => ({
  id,
  x: (slot % 4) * 136 + 4,
  y: Math.floor(slot / 4) * 136 + 4,
  width: 128,
  height: 128,
  anchor,
  role,
  gutter: 4,
});

const venueAtlas = (venue: VenueKind, bytes: number, regions: readonly PixelAtlasRegion[]): PixelAtlasManifest => Object.freeze({
  src: `./art/v3/venues/${venue}-atlas.webp`,
  width: 544,
  height: 272,
  bytes,
  regions: Object.freeze(regions),
});

export const VENUE_ART_MANIFESTS: Readonly<Record<VenueKind, VenueArtManifest>> = Object.freeze({
  cafe: Object.freeze({
    id: 'v3-cafe-filmic-density',
    venue: 'cafe',
    shared: SHARED_ATLAS,
    venueAtlas: venueAtlas('cafe', 182_250, [
      venueRegion('surface-floor', 0, 'surface'),
      venueRegion('surface-wood', 1, 'surface'),
      venueRegion('surface-wall', 2, 'surface'),
      venueRegion('prop-primary', 3, 'prop', { x: 0.5, y: 1 }),
      venueRegion('surface-glass', 4, 'surface'),
      venueRegion('surface-metal', 5, 'surface'),
      venueRegion('emission-primary', 6, 'emission'),
      venueRegion('foreground-detail', 7, 'foreground', { x: 0.5, y: 1 }),
    ]),
  }),
  ramen: Object.freeze({
    id: 'v3-ramen-filmic-density',
    venue: 'ramen',
    shared: SHARED_ATLAS,
    venueAtlas: venueAtlas('ramen', 167_258, [
      venueRegion('surface-tile', 0, 'surface'),
      venueRegion('surface-wood', 1, 'surface'),
      venueRegion('surface-floor', 2, 'surface'),
      venueRegion('surface-metal', 3, 'surface'),
      venueRegion('prop-noren', 4, 'prop', { x: 0.5, y: 0 }),
      venueRegion('prop-primary', 5, 'prop', { x: 0.5, y: 1 }),
      venueRegion('foreground-detail', 6, 'foreground', { x: 0.5, y: 1 }),
      venueRegion('emission-primary', 7, 'emission'),
    ]),
  }),
  arcade: Object.freeze({
    id: 'v3-arcade-filmic-density',
    venue: 'arcade',
    shared: SHARED_ATLAS,
    venueAtlas: venueAtlas('arcade', 151_952, [
      venueRegion('surface-wall', 0, 'surface'),
      venueRegion('prop-primary', 1, 'prop', { x: 0.5, y: 1 }),
      venueRegion('surface-floor', 2, 'surface'),
      venueRegion('foreground-detail', 3, 'foreground', { x: 0.5, y: 1 }),
      venueRegion('prop-poster', 4, 'prop'),
      venueRegion('prop-secondary', 5, 'prop', { x: 0.5, y: 1 }),
      venueRegion('emission-cyan', 6, 'emission'),
      venueRegion('emission-magenta', 7, 'emission'),
    ]),
  }),
});

export function validatePixelAtlas(atlas: PixelAtlasManifest): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const region of atlas.regions) {
    if (ids.has(region.id)) issues.push(`duplicate-region:${region.id}`);
    ids.add(region.id);
    if (region.gutter < 2) issues.push(`gutter:${region.id}`);
    if (region.x < region.gutter || region.y < region.gutter
      || region.x + region.width + region.gutter > atlas.width
      || region.y + region.height + region.gutter > atlas.height) {
      issues.push(`bounds:${region.id}`);
    }
    if (region.anchor.x < 0 || region.anchor.x > 1 || region.anchor.y < 0 || region.anchor.y > 1) {
      issues.push(`anchor:${region.id}`);
    }
  }
  return issues;
}

export function validateVenueArtManifest(manifest: VenueArtManifest): VenueArtManifestReport {
  const issues = [
    ...validatePixelAtlas(manifest.shared),
    ...validatePixelAtlas(manifest.venueAtlas),
  ];
  const sharedIds = new Set(manifest.shared.regions.map((region) => region.id));
  for (const id of CHARACTER_REGION_IDS) if (!sharedIds.has(id)) issues.push(`missing-character:${id}`);
  for (const role of ['surface', 'prop', 'foreground', 'emission'] as const) {
    if (!manifest.venueAtlas.regions.some((region) => region.role === role)) issues.push(`missing-role:${role}`);
  }
  return { valid: issues.length === 0, issues };
}

export function validateVenueArtBudgets(): VenueArtBudgetReport {
  const manifests = Object.values(VENUE_ART_MANIFESTS);
  const totalBytes = SHARED_ATLAS.bytes + manifests.reduce((sum, manifest) => sum + manifest.venueAtlas.bytes, 0);
  const maximumActiveBytes = Math.max(...manifests.map((manifest) => manifest.shared.bytes + manifest.venueAtlas.bytes));
  const issues: string[] = [];
  if (totalBytes > 4_000_000) issues.push('total-graphic-assets');
  if (maximumActiveBytes > 1_500_000) issues.push('active-art-pack');
  return { valid: issues.length === 0, totalBytes, maximumActiveBytes, issues };
}

type TextureLoad = (src: string) => Promise<Texture>;

function configureAtlas(texture: Texture, name: string): Texture {
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

function dimensions(texture: Texture): Readonly<{ width: number; height: number }> | undefined {
  const image = texture.image as { width?: unknown; height?: unknown } | undefined;
  return typeof image?.width === 'number' && typeof image.height === 'number'
    ? { width: image.width, height: image.height }
    : undefined;
}

class LoadedVenueArtPackImpl implements LoadedVenueArtPack {
  private readonly regionTextures = new Map<string, Texture>();
  private isDisposed = false;

  constructor(
    readonly manifest: VenueArtManifest,
    readonly sharedTexture: Texture,
    readonly venueTexture: Texture,
  ) {}

  get id(): string { return this.manifest.id; }
  get venue(): VenueKind { return this.manifest.venue; }
  get textureBytes(): number { return this.manifest.shared.bytes + this.manifest.venueAtlas.bytes; }
  get disposed(): boolean { return this.isDisposed; }

  region(id: string): PixelAtlasRegion | undefined {
    return this.manifest.shared.regions.find((region) => region.id === id)
      ?? this.manifest.venueAtlas.regions.find((region) => region.id === id);
  }

  textureForRegion(id: string): Texture | undefined {
    if (this.isDisposed) return undefined;
    const cached = this.regionTextures.get(id);
    if (cached) return cached;
    const region = this.region(id);
    if (!region) return undefined;
    const atlas = region.role === 'character' ? this.manifest.shared : this.manifest.venueAtlas;
    const source = region.role === 'character' ? this.sharedTexture : this.venueTexture;
    const texture = source.clone();
    texture.name = `${this.id}:${id}`;
    texture.offset.set(region.x / atlas.width, 1 - (region.y + region.height) / atlas.height);
    texture.repeat.set(region.width / atlas.width, region.height / atlas.height);
    configureAtlas(texture, texture.name);
    this.regionTextures.set(id, texture);
    return texture;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (const texture of this.regionTextures.values()) texture.dispose();
    this.regionTextures.clear();
    this.sharedTexture.dispose();
    this.venueTexture.dispose();
  }
}

export class VenueArtPackLoader {
  state: ArtAssetState = 'procedural';
  lastError?: Error;
  private generation = 0;

  constructor(private readonly loadTexture: TextureLoad = async (src) => {
    const texture = await new TextureLoader().loadAsync(src);
    return configureAtlas(texture, src);
  }) {}

  cancel(): void {
    this.generation += 1;
    this.state = 'procedural';
  }

  async load(venue: VenueKind): Promise<LoadedVenueArtPack | undefined> {
    const request = ++this.generation;
    const manifest = VENUE_ART_MANIFESTS[venue];
    this.state = 'loading';
    this.lastError = undefined;
    const results = await Promise.allSettled([
      this.loadTexture(manifest.shared.src),
      this.loadTexture(manifest.venueAtlas.src),
    ]);
    const loaded = results
      .filter((result): result is PromiseFulfilledResult<Texture> => result.status === 'fulfilled')
      .map((result) => result.value);
    if (request !== this.generation) {
      for (const texture of loaded) texture.dispose();
      return undefined;
    }
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected) {
      for (const texture of loaded) texture.dispose();
      this.state = 'failed';
      this.lastError = rejected.reason instanceof Error ? rejected.reason : new Error('art-pack-load');
      return undefined;
    }
    const [sharedTexture, venueTexture] = loaded;
    if (!sharedTexture || !venueTexture) {
      for (const texture of loaded) texture.dispose();
      this.state = 'failed';
      this.lastError = new Error('art-pack-incomplete');
      return undefined;
    }
    const sharedSize = dimensions(sharedTexture);
    const venueSize = dimensions(venueTexture);
    if ((sharedSize && (sharedSize.width !== manifest.shared.width || sharedSize.height !== manifest.shared.height))
      || (venueSize && (venueSize.width !== manifest.venueAtlas.width || venueSize.height !== manifest.venueAtlas.height))) {
      sharedTexture.dispose();
      venueTexture.dispose();
      this.state = 'failed';
      this.lastError = new Error('art-pack-dimensions');
      return undefined;
    }
    this.state = 'ready';
    return new LoadedVenueArtPackImpl(manifest, sharedTexture, venueTexture);
  }
}

export const VENUE_ART_BUDGET_REPORT = validateVenueArtBudgets();
export const VENUE_ART_MANIFEST_REPORTS: Readonly<Record<VenueKind, VenueArtManifestReport>> = Object.freeze({
  cafe: validateVenueArtManifest(VENUE_ART_MANIFESTS.cafe),
  ramen: validateVenueArtManifest(VENUE_ART_MANIFESTS.ramen),
  arcade: validateVenueArtManifest(VENUE_ART_MANIFESTS.arcade),
});
