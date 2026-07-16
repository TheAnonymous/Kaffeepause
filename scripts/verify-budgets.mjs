import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const fail = (message) => { throw new Error(message); };
const assets = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const manifestEntries = Object.entries(manifest);
const gzipBytes = (file) => gzipSync(readFileSync(join('dist', file)), { level: 9 }).byteLength;
const entry = manifestEntries.find(([, value]) => value.isEntry);
const renderer = manifestEntries.find(([, value]) => value.name === 'webglRendererLifecycle');
if (!entry || !renderer) fail('build manifest is missing the entry or renderer graph');
const incrementalRendererGraph = (rootKey, entryKey) => {
  const visited = new Set();
  const visit = (key) => {
    if (key === entryKey || visited.has(key)) return;
    visited.add(key);
    const node = manifest[key];
    for (const dependency of [...(node?.imports ?? []), ...(node?.dynamicImports ?? [])]) visit(dependency);
  };
  visit(rootKey);
  return [...visited].map((key) => manifest[key]?.file).filter((file) => typeof file === 'string');
};
const entryGzipBytes = gzipBytes(entry[1].file);
const rendererFiles = incrementalRendererGraph(renderer[0], entry[0]);
const rendererGzipBytes = rendererFiles.reduce((total, file) => total + gzipBytes(file), 0);
const totalJavascriptGzipBytes = assets.reduce((total, file) => total + gzipBytes(join('assets', file)), 0);
if (entryGzipBytes > 40_000) fail(`entry graph: ${entryGzipBytes} gzip bytes exceeds 40 kB`);
if (rendererGzipBytes > 185_000) fail(`renderer graph: ${rendererGzipBytes} gzip bytes exceeds 185 kB`);
if (totalJavascriptGzipBytes > 225_000) fail(`total JavaScript: ${totalJavascriptGzipBytes} gzip bytes exceeds 225 kB`);

const audioFiles = ['cafe', 'ramen', 'arcade'].flatMap((venue) =>
  readdirSync(join('public/audio', venue)).filter((file) => file.endsWith('.mp3')).map((file) => join('public/audio', venue, file)),
);
const audioBytes = audioFiles.reduce((total, file) => total + statSync(file).size, 0);
if (audioFiles.length !== 15) fail(`expected 15 MP3 files, found ${audioFiles.length}`);
if (audioBytes > 3_000_000) fail(`audio: ${audioBytes} bytes exceeds 3 MB`);
for (const file of audioFiles) {
  const metadata = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,bit_rate',
    '-show_entries', 'format=duration', '-of', 'json', file,
  ], { encoding: 'utf8' }));
  const stream = metadata.streams?.[0];
  const duration = Number(metadata.format?.duration ?? 0);
  if (stream?.sample_rate !== '44100' || stream?.channels !== 1 || Number(stream?.bit_rate ?? 0) > 96_000) {
    fail(`${file}: expected mono 44.1 kHz <=96 kbit/s`);
  }
  if (file.endsWith('atmosphere.mp3') && (duration < 30 || duration > 45)) fail(`${file}: loop duration ${duration}`);
}

const sharedArt = join('public/art/v3/shared', 'character-atlas.webp');
const venueArt = ['cafe', 'ramen', 'arcade'].map((venue) => join('public/art/v3/venues', `${venue}-atlas.webp`));
const sharedAtmosphereArt = join('public/art/v5/shared', 'atmosphere-atlas.webp');
const venueAtmosphereArt = ['cafe', 'ramen', 'arcade']
  .map((venue) => join('public/art/v5/venues', `${venue}-atlas.webp`));
const artFiles = [sharedArt, ...venueArt, sharedAtmosphereArt, ...venueAtmosphereArt];
const sharedArtBytes = statSync(sharedArt).size;
const venueArtBytes = venueArt.map((file) => statSync(file).size);
const sharedAtmosphereArtBytes = statSync(sharedAtmosphereArt).size;
const venueAtmosphereArtBytes = venueAtmosphereArt.map((file) => statSync(file).size);
const artBytes = artFiles.reduce((total, file) => total + statSync(file).size, 0);
const maximumActiveArtBytes = sharedArtBytes + Math.max(...venueArtBytes)
  + sharedAtmosphereArtBytes + Math.max(...venueAtmosphereArtBytes);
if (artBytes > 4_000_000) fail(`art: ${artBytes} bytes exceeds 4 MB`);
if (maximumActiveArtBytes > 1_500_000) {
  fail(`active art pack: ${maximumActiveArtBytes} bytes exceeds 1.5 MB`);
}

console.log(JSON.stringify({
  javascript: {
    files: assets.length,
    entryGzipBytes,
    rendererGzipBytes,
    totalGzipBytes: totalJavascriptGzipBytes,
    rendererFiles,
  },
  audioFiles: audioFiles.length,
  audioBytes,
  artFiles: artFiles.length,
  artBytes,
  maximumActiveArtBytes,
}));
