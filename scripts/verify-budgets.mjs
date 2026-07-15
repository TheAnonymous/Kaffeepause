import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const fail = (message) => { throw new Error(message); };
const assets = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));
for (const file of assets) {
  const source = readFileSync(join('dist/assets', file));
  if (source.byteLength > 650_000) fail(`${file}: ${source.byteLength} bytes exceeds 650 kB`);
  const gzip = gzipSync(source).byteLength;
  if (gzip > 170_000) fail(`${file}: ${gzip} gzip bytes exceeds 170 kB`);
}

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

console.log(JSON.stringify({ javascript: assets.length, audioFiles: audioFiles.length, audioBytes }));
