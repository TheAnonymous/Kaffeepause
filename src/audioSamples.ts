import type { MomentAudioCue } from './simulation/momentRegistry';
import type { VenueKind } from './venue';

export type VenueSampleState = 'idle' | 'loading' | 'ready' | 'partial' | 'fallback';

export interface VenueSampleManifestEntry {
  readonly id: `${VenueKind}-${string}`;
  readonly venue: VenueKind;
  readonly file: string;
  readonly level: number;
  readonly behavior: 'loop' | 'one-shot';
  readonly cue: 'atmosphere' | MomentAudioCue;
  readonly origin: Readonly<{
    title: string;
    author: string;
    sourceUrl: string;
    license: 'CC0-1.0';
    accessedAt: string;
    sha256: string;
  }>;
}

const origin = (title: string, author: string, sourceUrl: string, sha256: string): VenueSampleManifestEntry['origin'] => ({
  title, author, sourceUrl, license: 'CC0-1.0', accessedAt: '2026-07-15', sha256,
});

// Hashes are verified against the shipped, normalized MP3 files by the audio budget test.
export const VENUE_SAMPLE_MANIFEST: readonly VenueSampleManifestEntry[] = Object.freeze([
  { id: 'cafe-atmosphere', venue: 'cafe', file: 'audio/cafe/atmosphere.mp3', level: 0.16, behavior: 'loop', cue: 'atmosphere', origin: origin('Rainy cafe room tone', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '4fde8884e59b9dbff26a51e43b7f863562907f1bef07ef60541b0314cd580e21') },
  { id: 'cafe-cup', venue: 'cafe', file: 'audio/cafe/cup.mp3', level: 0.2, behavior: 'one-shot', cue: 'cup', origin: origin('Ceramic cup', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', 'c214f3912461842bc9c48baf64cd47736f7650357463390a061c65121ac3f117') },
  { id: 'cafe-plate', venue: 'cafe', file: 'audio/cafe/plate.mp3', level: 0.18, behavior: 'one-shot', cue: 'plate', origin: origin('Small plate', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', 'a8ff52dd591e1767ecb544a145926892ae380ee55b351e0f39a81945c7cc952a') },
  { id: 'cafe-chair', venue: 'cafe', file: 'audio/cafe/chair.mp3', level: 0.13, behavior: 'one-shot', cue: 'chair', origin: origin('Wood chair', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '66d8c6dccbcdf23ac53bbde8dae3c5410c568cf6c03726c07eac7414cab180ec') },
  { id: 'cafe-door-bell', venue: 'cafe', file: 'audio/cafe/door-bell.mp3', level: 0.16, behavior: 'one-shot', cue: 'door-bell', origin: origin('Door bell', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '0a8a201a781a50f32ac4210d3a93f789a3cdb49e42d7b294974ce011f2468005') },

  { id: 'ramen-atmosphere', venue: 'ramen', file: 'audio/ramen/atmosphere.mp3', level: 0.15, behavior: 'loop', cue: 'atmosphere', origin: origin('Ramen room tone', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '1a25cc376ed36bed78268175a7cc286ef4505fddb11ef7bbe45dfb5ac4464fc8') },
  { id: 'ramen-bowl', venue: 'ramen', file: 'audio/ramen/bowl.mp3', level: 0.18, behavior: 'one-shot', cue: 'bowl', origin: origin('Ramen bowl', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '505e220945b57f5c05e157d75ca52be96e0f44810bab743b4574803ade0908ae') },
  { id: 'ramen-ladle', venue: 'ramen', file: 'audio/ramen/ladle.mp3', level: 0.15, behavior: 'one-shot', cue: 'ladle', origin: origin('Soup ladle', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '1e0f8bd624e455e10655fc2c1dabe3600c27df7cd27a3891bd15c46cff0f82ce') },
  { id: 'ramen-curtain', venue: 'ramen', file: 'audio/ramen/curtain.mp3', level: 0.13, behavior: 'one-shot', cue: 'curtain', origin: origin('Noren curtain', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '6acf5fe2e66647834be9430c12774a525f569fb77ec84308b925fcee94505dab') },
  { id: 'ramen-condiment', venue: 'ramen', file: 'audio/ramen/condiment.mp3', level: 0.14, behavior: 'one-shot', cue: 'condiment', origin: origin('Condiment bottle', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', 'aa01156f8d05089e0b0b20f6366c29288adbaaf2585d2755cefd5eaca2fea7d9') },

  { id: 'arcade-atmosphere', venue: 'arcade', file: 'audio/arcade/atmosphere.mp3', level: 0.13, behavior: 'loop', cue: 'atmosphere', origin: origin('Quiet arcade room tone', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '45ebfa66c6b4bf924448cd599e9ab52ad1e22d668cb3de5de9b6a85d654375b3') },
  { id: 'arcade-button', venue: 'arcade', file: 'audio/arcade/button.mp3', level: 0.13, behavior: 'one-shot', cue: 'button', origin: origin('Arcade button', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', 'e4d98b082520d63c1e878683fe77d99cf48329742e670c621a4d338bbc3121de') },
  { id: 'arcade-coin', venue: 'arcade', file: 'audio/arcade/coin.mp3', level: 0.12, behavior: 'one-shot', cue: 'coin', origin: origin('Metal token', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', 'dc9508b628e823df36833ce1df67a5299418d67e7e362d234453816a9c39791a') },
  { id: 'arcade-ticket', venue: 'arcade', file: 'audio/arcade/ticket.mp3', level: 0.11, behavior: 'one-shot', cue: 'ticket', origin: origin('Ticket mechanism', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '2ed5a44cd6ed90f5a6f35bd36d7bb56be3a2fae87fe0d1270fd81120d1190a73') },
  { id: 'arcade-relay', venue: 'arcade', file: 'audio/arcade/relay.mp3', level: 0.12, behavior: 'one-shot', cue: 'relay', origin: origin('Cabinet relay', 'TheAnonymous / Kaffeepause', 'https://github.com/TheAnonymous/Kaffeepause/tree/main/public/audio', '53bbf2b748b7588983d348e4244660f9bf7f65633777cdb2857aae8ce6ec7dc6') },
]);

export interface LoadedVenueSamplePack {
  readonly state: Exclude<VenueSampleState, 'idle' | 'loading'>;
  readonly buffers: ReadonlyMap<string, AudioBuffer>;
  readonly failedIds: readonly string[];
}

export async function loadVenueSamplePack(
  context: BaseAudioContext,
  venue: VenueKind,
  fetcher: typeof fetch = fetch,
  baseUrl = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI,
): Promise<LoadedVenueSamplePack> {
  const entries = VENUE_SAMPLE_MANIFEST.filter((entry) => entry.venue === venue);
  const buffers = new Map<string, AudioBuffer>();
  const failedIds: string[] = [];
  await Promise.all(entries.map(async (entry) => {
    try {
      const response = await fetcher(new URL(entry.file, baseUrl));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      buffers.set(entry.id, buffer);
    } catch {
      failedIds.push(entry.id);
    }
  }));
  const atmosphereLoaded = buffers.has(`${venue}-atmosphere`);
  return {
    state: !atmosphereLoaded ? 'fallback' : failedIds.length > 0 ? 'partial' : 'ready',
    buffers,
    failedIds: Object.freeze(failedIds.sort()),
  };
}

export function samplesForVenue(venue: VenueKind): readonly VenueSampleManifestEntry[] {
  return VENUE_SAMPLE_MANIFEST.filter((entry) => entry.venue === venue);
}
