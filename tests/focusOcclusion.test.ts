import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  fadeFocusOccluder,
  focusOccluderOpacity,
  restoreFocusOccluder,
  selectFocusOccluders,
} from '../src/diorama/focusOcclusion';
import type { FocusOccluder } from '../src/diorama/types';
import { buildVenue } from '../src/diorama/venueBuilder';

function occluder(id: string, x: number, z: number, opacity = 1): FocusOccluder {
  const material = new MeshStandardMaterial({ transparent: false, opacity, depthWrite: true });
  const object = new Group();
  object.position.set(x, 1, z);
  object.add(new Mesh(new BoxGeometry(1.6, 2, 0.7), material));
  return {
    id,
    kind: 'table',
    object,
    materials: [{ material, opacity, transparent: false, depthWrite: true }],
  };
}

describe('gezielte Fokus-Sichtblocker', () => {
  it('wählt nur Möbel vor Gesicht, Schultern oder Händen, nicht seitlich oder hinter der Figur', () => {
    const front = occluder('front', 0, 5);
    const side = occluder('side', 4, 5);
    const behind = occluder('behind', 0, -2);
    const selected = selectFocusOccluders(
      new Vector3(0, 2.2, 10),
      [{ id: 'guest', position: new Vector3(0, 0, 0), height: 2, width: 1.2 }],
      [front, side, behind],
    );
    expect(selected.map((entry) => entry.id)).toEqual(['front']);
  });

  it('blendet proportional bis 48 Prozent und stellt alle Materialwerte exakt wieder her', () => {
    const entry = occluder('table', 0, 5, 0.8);
    const material = entry.materials[0]?.material;
    if (!material) throw new Error('Testmaterial fehlt.');
    expect(focusOccluderOpacity(0)).toBe(1);
    expect(focusOccluderOpacity(1)).toBe(0.48);

    fadeFocusOccluder(entry, 1);
    expect(material.opacity).toBeCloseTo(0.384);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);

    restoreFocusOccluder(entry);
    expect(material.opacity).toBe(0.8);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });

  it('veröffentlicht in jeder Venue Tische, Stühle, Tresen und vorhandene Automaten als Fokusmöbel', () => {
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const set = buildVenue(venue);
      expect(set.focusOccluders.some((entry) => entry.kind === 'table')).toBe(true);
      expect(set.focusOccluders.some((entry) => entry.kind === 'chair')).toBe(true);
      expect(set.focusOccluders.some((entry) => entry.kind === 'counter')).toBe(true);
      if (venue !== 'ramen') expect(set.focusOccluders.some((entry) => entry.kind === 'machine')).toBe(true);
      for (const entry of set.focusOccluders) expect(entry.materials.length).toBeGreaterThan(0);
      set.dispose();
    }
  });
});
