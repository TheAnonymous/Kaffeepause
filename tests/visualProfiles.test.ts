import { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { buildVenue } from '../src/diorama/venueBuilder';
import {
  VENUE_VISUAL_PROFILES,
  colorContrast,
  colorLuminance,
} from '../src/diorama/visualProfiles';

describe('VenueVisualProfile-Registry', () => {
  it.each(['cafe', 'ramen', 'arcade'] as const)('ist für %s vollständig und kontrastfest', (venue) => {
    const profile = VENUE_VISUAL_PROFILES[venue];
    expect(profile.id).toBe(venue);
    expect(Object.keys(profile.surfaces).sort()).toEqual([
      'emissive', 'floor', 'glass', 'metal', 'plaster', 'tile', 'wood',
    ]);
    expect(profile.camera.focusFov).toEqual([22, 26]);
    expect(profile.camera.safeArea).toMatchObject({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 });
    expect(profile.bloom.minimum).toBeLessThan(profile.bloom.maximum);
    expect(profile.bloom.maximum).toBeLessThanOrEqual(venue === 'arcade' ? 0.42 : 0.3);
    expect(profile.bloom.threshold).toBe(0.86);
    expect(profile.contrast.minimumShadowLift).toBeGreaterThanOrEqual(0.045);
    expect(colorLuminance(profile.palette.ink)).toBeGreaterThan(0.009);
    expect(colorContrast(profile.palette.ink, profile.lights.characterRim))
      .toBeGreaterThanOrEqual(profile.contrast.minimumCharacterContrast);
  });

  it('nimmt Ramen den monochromen Rotstich und hebt Arcade-Schwarz sichtbar an', () => {
    expect(colorContrast(VENUE_VISUAL_PROFILES.ramen.palette.wall, VENUE_VISUAL_PROFILES.ramen.surfaces.tile.base)).toBeGreaterThan(4);
    expect(colorLuminance(VENUE_VISUAL_PROFILES.arcade.palette.wallDark)).toBeGreaterThan(0.018);
    expect(VENUE_VISUAL_PROFILES.ramen.lights.fill).toBe('#9fc8d4');
  });
});

describe('venueabhängige Materialzuordnung', () => {
  it.each(['cafe', 'ramen', 'arcade'] as const)('nutzt in %s alle sieben prozeduralen Oberflächen', (venue) => {
    const set = buildVenue(venue);
    const materialKinds = new Set<string>();
    set.root.traverse((entry) => {
      if (!(entry instanceof Mesh)) return;
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && typeof material.userData.surfaceKind === 'string') {
          materialKinds.add(material.userData.surfaceKind);
        }
      }
    });
    expect(set.surfaceTextureCount).toBe(7);
    expect(set.surfaceKinds).toEqual(['emissive', 'floor', 'glass', 'metal', 'plaster', 'tile', 'wood']);
    expect([...materialKinds].every((kind) => kind in VENUE_VISUAL_PROFILES[venue].surfaces)).toBe(true);
    expect(materialKinds.size).toBeGreaterThanOrEqual(6);
    set.dispose();
  });
});
