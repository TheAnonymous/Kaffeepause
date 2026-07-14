import { describe, expect, it } from 'vitest';
import { FrameTextureCache } from '../src/diorama/spriteFactory';

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

