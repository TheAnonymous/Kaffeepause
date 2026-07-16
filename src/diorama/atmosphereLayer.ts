import {
  AdditiveBlending,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { VENUE_ATMOSPHERE_PROFILES, type AtmosphereSnapshot, type AtmosphereWaveKind } from '../atmosphere/types';
import type { RenderQualityTier } from '../scene/renderQuality';
import type { VenueKind } from '../venue';
import type { AtmosphereArtPack } from './atmosphereAssets';

const SHARED_REGION: Readonly<Partial<Record<AtmosphereWaveKind, string>>> = {
  'pedestrian-poetry': 'pedestrian',
  'traffic-glow': 'traffic',
  'rain-surge': 'rain-reflection',
  'wind-gust': 'wind',
  'distant-thunder': 'thunder',
  'snow-quiet': 'snow',
  'fog-glow': 'fog',
  sunbreak: 'city',
};

function material(color: string, opacity = 0): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: true,
  });
}

export class AtmosphereLayer {
  readonly root = new Group();
  readonly drawCalls = 4;
  private readonly backgroundMaterial = material('#86a9bc');
  private readonly reflectionMaterial = material('#e7b172');
  private readonly signatureMaterial = material('#ffffff');
  private readonly silhouetteMaterial = material('#a9bfd0');
  private readonly background: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly reflection: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly signature: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly silhouettes: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly geometries: readonly PlaneGeometry[];
  private readonly matrix = new Matrix4();
  private pack?: AtmosphereArtPack;
  private venue: VenueKind = 'cafe';
  private mappedWave: AtmosphereWaveKind | 'none' = 'none';

  constructor() {
    this.root.name = 'v5-atmosphere-layer';
    const backgroundGeometry = new PlaneGeometry(10.5, 6.15);
    const reflectionGeometry = new PlaneGeometry(9.8, 3.4);
    const signatureGeometry = new PlaneGeometry(2.6, 1.8);
    const silhouetteGeometry = new PlaneGeometry(1.1, 2.45);
    this.geometries = [backgroundGeometry, reflectionGeometry, signatureGeometry, silhouetteGeometry];
    this.background = new Mesh(backgroundGeometry, this.backgroundMaterial);
    this.background.name = 'atmosphere:city-window';
    this.background.position.set(-0.45, 4.35, -3.5);
    this.background.renderOrder = -1;
    this.reflection = new Mesh(reflectionGeometry, this.reflectionMaterial);
    this.reflection.name = 'atmosphere:floor-reflection';
    this.reflection.rotation.x = -Math.PI / 2;
    this.reflection.position.set(0, 0.115, -0.65);
    this.reflection.renderOrder = 2;
    this.signature = new Mesh(signatureGeometry, this.signatureMaterial);
    this.signature.name = 'atmosphere:venue-signature';
    this.signature.renderOrder = 1;
    this.silhouettes = new InstancedMesh(silhouetteGeometry, this.silhouetteMaterial, 6);
    this.silhouettes.name = 'atmosphere:pedestrian-pool';
    this.silhouettes.renderOrder = 0;
    this.silhouettes.count = 0;
    this.root.add(this.background, this.reflection, this.signature, this.silhouettes);
    this.root.visible = false;
    this.setVenue('cafe');
    this.updateSilhouettes(0, false, 6);
  }

  setVenue(venue: VenueKind): void {
    this.venue = venue;
    const profile = VENUE_ATMOSPHERE_PROFILES[venue];
    this.backgroundMaterial.color.set(profile.exteriorColor);
    this.signatureMaterial.color.set(profile.accentColor);
    if (venue === 'cafe') {
      this.signature.position.set(5.85, 2.05, -2.72);
      this.signature.scale.set(0.56, 0.56, 0.56);
    } else if (venue === 'ramen') {
      this.signature.position.set(-0.3, 2.82, -2.72);
      this.signature.scale.set(0.82, 0.82, 0.82);
    } else {
      this.signature.position.set(0, 5.02, -2.72);
      this.signature.scale.set(1.22, 0.72, 1);
    }
    this.mappedWave = 'none';
  }

  setAssets(pack: AtmosphereArtPack | undefined): void {
    this.pack = pack;
    this.backgroundMaterial.map = pack?.textureForRegion('shared', 'city') ?? null;
    this.silhouetteMaterial.map = pack?.textureForRegion('shared', 'pedestrian') ?? null;
    this.signatureMaterial.map = pack?.textureForRegion('venue', 'signature-primary') ?? null;
    this.reflectionMaterial.map = pack?.textureForRegion('venue', 'floor-reflection') ?? null;
    for (const entry of [this.backgroundMaterial, this.silhouetteMaterial, this.signatureMaterial, this.reflectionMaterial]) {
      entry.needsUpdate = true;
    }
    this.mappedWave = 'none';
  }

  update(snapshot: AtmosphereSnapshot, tier: RenderQualityTier, time: number): void {
    const intensity = snapshot.intensity;
    const textured = tier !== 'fallback';
    this.root.visible = intensity > 0.004 && textured;
    if (!this.root.visible) return;
    if (snapshot.wave !== this.mappedWave) this.mapWave(snapshot.wave);
    const exterior = snapshot.zone === 'exterior' || snapshot.zone === 'window';
    const signature = snapshot.venueSignature;
    this.background.visible = exterior;
    this.reflection.visible = !signature && snapshot.wave !== 'pedestrian-poetry';
    // Ramen's existing pooled steam is the broth-breath silhouette. Re-lighting it
    // keeps the tight 130-call venue budget instead of drawing a duplicate quad.
    this.signature.visible = signature && this.venue !== 'ramen';
    this.silhouettes.visible = snapshot.wave === 'pedestrian-poetry';
    this.backgroundMaterial.opacity = intensity * (tier === 'master' ? 0.3 : 0.2);
    this.reflectionMaterial.opacity = intensity * (tier === 'master' ? 0.2 : 0.13);
    this.signatureMaterial.opacity = intensity * (tier === 'master' ? 0.34 : 0.23);
    this.silhouetteMaterial.opacity = intensity * (tier === 'master' ? 0.24 : 0.16);
    const count = tier === 'master' ? 6 : 3;
    this.silhouettes.count = snapshot.wave === 'pedestrian-poetry' ? count : 0;
    if (!snapshot.reducedMotion) {
      this.updateSilhouettes(time + (snapshot.seed % 97), true, count);
      this.reflection.position.x = Math.sin(time * 0.18 + snapshot.seed) * 0.7;
      this.signature.rotation.z = Math.sin(time * 0.32 + snapshot.seed) * 0.012;
    } else {
      this.reflection.position.x = 0;
      this.signature.rotation.z = 0;
      this.updateSilhouettes(0, false, count);
    }
  }

  private mapWave(wave: AtmosphereWaveKind | 'none'): void {
    this.mappedWave = wave;
    const sharedRegion = wave === 'none' ? undefined : SHARED_REGION[wave];
    const sharedMap = sharedRegion ? this.pack?.textureForRegion('shared', sharedRegion) : undefined;
    const venueRegion = wave === 'sunbreak' ? 'sunbreak'
      : wave === 'rain-surge' || wave === 'fog-glow' ? 'window-reflection'
        : 'floor-reflection';
    this.backgroundMaterial.map = sharedMap ?? this.pack?.textureForRegion('shared', 'city') ?? null;
    this.reflectionMaterial.map = this.pack?.textureForRegion('venue', venueRegion) ?? sharedMap ?? null;
    this.signatureMaterial.map = this.pack?.textureForRegion('venue', 'signature-primary') ?? null;
    this.silhouetteMaterial.map = this.pack?.textureForRegion('shared', 'pedestrian') ?? null;
    for (const entry of [this.backgroundMaterial, this.reflectionMaterial, this.signatureMaterial, this.silhouetteMaterial]) {
      entry.needsUpdate = true;
    }
  }

  private updateSilhouettes(time: number, animated: boolean, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const direction = index % 2 === 0 ? 1 : -1;
      const travel = animated ? ((time * (0.13 + index * 0.008) * direction + index * 0.19) % 1 + 1) % 1 : index / 6;
      const x = -5.2 + travel * 9.8;
      const scale = 0.62 + (index % 3) * 0.1;
      this.matrix.makeScale(scale, scale, 1);
      this.matrix.setPosition(x, 2.05 + (index % 2) * 0.08, -3.43 + index * 0.006);
      this.silhouettes.setMatrixAt(index, this.matrix);
    }
    this.silhouettes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.pack = undefined;
    this.silhouettes.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.backgroundMaterial.dispose();
    this.reflectionMaterial.dispose();
    this.signatureMaterial.dispose();
    this.silhouetteMaterial.dispose();
    this.root.removeFromParent();
  }
}

export interface AtmosphereLightCue {
  readonly key: number;
  readonly ambient: number;
  readonly practical: number;
  readonly exterior: number;
  readonly flash: number;
  readonly tint: string;
}

export function atmosphereLightCue(snapshot: AtmosphereSnapshot, time: number): AtmosphereLightCue {
  const amount = snapshot.intensity;
  const sunbreak = snapshot.wave === 'sunbreak' ? amount : 0;
  const fog = snapshot.wave === 'fog-glow' || snapshot.wave === 'snow-quiet' ? amount : 0;
  const venue = snapshot.venueSignature ? amount : 0;
  const thunder = snapshot.wave === 'distant-thunder'
    ? amount * Math.max(0, Math.sin(time * 5.7 + snapshot.seed) ** 18)
    : 0;
  return {
    key: sunbreak * 0.7 + thunder * 1.4,
    ambient: fog * 0.25 + venue * 0.08,
    practical: venue * 0.45,
    exterior: (snapshot.zone === 'exterior' || snapshot.zone === 'window') ? amount * 0.16 : 0,
    flash: thunder,
    tint: snapshot.wave === 'sunbreak' ? '#ffd696' : snapshot.wave === 'distant-thunder' ? '#c9d9ff' : '#ffffff',
  };
}
