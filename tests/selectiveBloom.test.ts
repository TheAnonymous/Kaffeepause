import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import {
  SELECTIVE_BLOOM_LAYER,
  countSelectiveBloomSurfaces,
  isSelectiveBloomSurface,
  registerSelectiveBloomSurface,
} from '../src/diorama/selectiveBloom';

describe('selektiver Bloom-Layer', () => {
  it('registriert nur explizite Leuchtflächen und lässt Figuren im Basis-Layer', () => {
    const root = new Group();
    const neon = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
    const character = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
    root.add(neon, character);
    registerSelectiveBloomSurface(neon);
    expect(isSelectiveBloomSurface(neon)).toBe(true);
    expect(neon.layers.isEnabled(SELECTIVE_BLOOM_LAYER)).toBe(true);
    expect(isSelectiveBloomSurface(character)).toBe(false);
    expect(countSelectiveBloomSurfaces(root)).toBe(1);
  });
});
