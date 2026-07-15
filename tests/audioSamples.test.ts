import { describe, expect, it, vi } from 'vitest';
import { loadVenueSamplePack, samplesForVenue, VENUE_SAMPLE_MANIFEST } from '../src/audioSamples';

function context(failsAt = -1): BaseAudioContext {
  let call = 0;
  return {
    decodeAudioData: vi.fn(async () => {
      const current = call++;
      if (current === failsAt) throw new Error('decode');
      return { duration: 40 } as AudioBuffer;
    }),
  } as unknown as BaseAudioContext;
}

function fetcher(failsAt = -1): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const current = call++;
    return current === failsAt
      ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
      : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
  }) as unknown as typeof fetch;
}

describe('Venue-Samplepakete', () => {
  it('enthält pro Ort genau einen Loop und vier One-Shots mit dokumentiertem Hash', () => {
    expect(VENUE_SAMPLE_MANIFEST).toHaveLength(15);
    for (const venue of ['cafe', 'ramen', 'arcade'] as const) {
      const entries = samplesForVenue(venue);
      expect(entries.filter((entry) => entry.behavior === 'loop')).toHaveLength(1);
      expect(entries.filter((entry) => entry.behavior === 'one-shot')).toHaveLength(4);
      expect(entries.every((entry) => entry.origin.license === 'CC0-1.0' && /^[a-f0-9]{64}$/.test(entry.origin.sha256))).toBe(true);
    }
  });

  it('lädt einen vollständigen Ort ohne fremde Pakete', async () => {
    const load = fetcher();
    const pack = await loadVenueSamplePack(context(), 'cafe', load, 'https://example.test/');
    expect(pack.state).toBe('ready');
    expect(pack.buffers.size).toBe(5);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it('behält bei Foley-404 oder Dekodierfehlern den Rest und fällt ohne Atmosphärenloop prozedural zurück', async () => {
    expect((await loadVenueSamplePack(context(), 'ramen', fetcher(2), 'https://example.test/')).state).toBe('partial');
    expect((await loadVenueSamplePack(context(3), 'arcade', fetcher(), 'https://example.test/')).state).toBe('partial');
    expect((await loadVenueSamplePack(context(), 'cafe', fetcher(0), 'https://example.test/')).state).toBe('fallback');
    expect((await loadVenueSamplePack(context(0), 'cafe', fetcher(), 'https://example.test/')).state).toBe('fallback');
  });
});
