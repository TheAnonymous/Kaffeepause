import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { VenueKind } from '../venue';
import type { DialogueLine } from './dialogue';
import type { EmoteSymbol } from './emotes';

const WIDTH = 256;
const HEIGHT = 112;

const PALETTES: Readonly<Record<VenueKind, { paper: string; light: string; ink: string; border: string; accent: string }>> = {
  cafe: { paper: '#f2dfb6', light: '#fff2cd', ink: '#3a2830', border: '#71483e', accent: '#c47a55' },
  ramen: { paper: '#f0d8ab', light: '#ffe9bc', ink: '#41232a', border: '#8c3838', accent: '#d65545' },
  arcade: { paper: '#d8eef0', light: '#effdff', ink: '#17243c', border: '#315a78', accent: '#cf55b8' },
};

function pixel(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawEmoteIcon(
  context: CanvasRenderingContext2D,
  emote: EmoteSymbol,
  x: number,
  y: number,
  ink: string,
  accent: string,
): void {
  const light = '#fff7d4';
  if (emote === 'heart') {
    pixel(context, accent, x + 7, y + 5, 10, 8); pixel(context, accent, x + 21, y + 5, 10, 8);
    pixel(context, accent, x + 3, y + 10, 32, 10); pixel(context, accent, x + 8, y + 20, 22, 6); pixel(context, accent, x + 14, y + 26, 10, 5);
  } else if (emote === 'spark' || emote === 'star') {
    pixel(context, accent, x + 16, y + 1, 6, 34); pixel(context, accent, x + 2, y + 15, 34, 6);
    pixel(context, accent, x + 9, y + 8, 20, 20); pixel(context, light, x + 16, y + 12, 6, 8);
    if (emote === 'star') { pixel(context, ink, x + 5, y + 4, 5, 5); pixel(context, ink, x + 29, y + 27, 5, 5); }
  } else if (emote === 'drink') {
    pixel(context, ink, x + 5, y + 8, 24, 22); pixel(context, light, x + 9, y + 12, 16, 13);
    pixel(context, accent, x + 10, y + 21, 14, 5); pixel(context, ink, x + 29, y + 13, 7, 13); pixel(context, light, x + 29, y + 16, 3, 7);
  } else if (emote === 'noodle') {
    pixel(context, accent, x + 3, y + 19, 32, 5); pixel(context, ink, x + 7, y + 24, 24, 7);
    for (const offset of [9, 16, 23]) pixel(context, accent, x + offset, y + 5, 3, 14);
    pixel(context, ink, x + 2, y + 15, 34, 3);
  } else if (emote === 'steam') {
    for (const offset of [6, 17, 28]) {
      pixel(context, accent, x + offset, y + 3, 5, 7); pixel(context, accent, x + offset - 3, y + 10, 5, 7); pixel(context, accent, x + offset, y + 17, 5, 8);
    }
  } else if (emote === 'music') {
    pixel(context, ink, x + 12, y + 4, 5, 22); pixel(context, ink, x + 17, y + 4, 17, 5); pixel(context, ink, x + 29, y + 8, 5, 18);
    pixel(context, accent, x + 4, y + 23, 13, 9); pixel(context, accent, x + 21, y + 23, 13, 9);
  } else if (emote === 'game') {
    pixel(context, ink, x + 3, y + 11, 32, 19); pixel(context, light, x + 7, y + 15, 24, 10);
    pixel(context, accent, x + 10, y + 16, 4, 9); pixel(context, accent, x + 7, y + 19, 10, 4);
    pixel(context, accent, x + 24, y + 17, 5, 5); pixel(context, accent, x + 20, y + 22, 5, 5);
  } else if (emote === 'tool') {
    pixel(context, ink, x + 8, y + 23, 23, 6); pixel(context, ink, x + 22, y + 8, 7, 20);
    pixel(context, accent, x + 18, y + 3, 7, 10); pixel(context, accent, x + 28, y + 3, 7, 10); pixel(context, light, x + 25, y + 7, 5, 5);
  } else if (emote === 'question') {
    pixel(context, ink, x + 10, y + 4, 20, 5); pixel(context, ink, x + 25, y + 8, 6, 10); pixel(context, ink, x + 17, y + 15, 11, 6);
    pixel(context, ink, x + 15, y + 20, 6, 7); pixel(context, accent, x + 15, y + 30, 6, 5);
  } else if (emote === 'surprise') {
    pixel(context, ink, x + 4, y + 4, 30, 30); pixel(context, light, x + 8, y + 8, 22, 22);
    pixel(context, ink, x + 17, y + 10, 5, 11); pixel(context, accent, x + 17, y + 24, 5, 5);
  } else if (emote === 'laugh' || emote === 'apology') {
    pixel(context, ink, x + 4, y + 5, 30, 28); pixel(context, light, x + 8, y + 9, 22, 19);
    pixel(context, ink, x + 11, y + 14, 5, 4); pixel(context, ink, x + 23, y + 14, 5, 4);
    if (emote === 'laugh') { pixel(context, accent, x + 12, y + 21, 16, 7); pixel(context, light, x + 16, y + 21, 8, 3); }
    else { pixel(context, accent, x + 4, y + 20, 5, 10); pixel(context, ink, x + 14, y + 23, 12, 3); }
  } else if (emote === 'order') {
    pixel(context, ink, x + 7, y + 4, 25, 30); pixel(context, light, x + 11, y + 9, 17, 20);
    pixel(context, accent, x + 14, y + 2, 11, 7); pixel(context, ink, x + 14, y + 14, 11, 3); pixel(context, ink, x + 14, y + 21, 11, 3);
  } else {
    pixel(context, ink, x + 2, y + 7, 34, 23); pixel(context, light, x + 6, y + 11, 26, 13);
    pixel(context, ink, x + 10, y + 16, 4, 4); pixel(context, ink, x + 18, y + 16, 4, 4); pixel(context, ink, x + 26, y + 16, 4, 4);
    pixel(context, ink, x + 8, y + 29, 7, 5);
  }
}

function drawPixelBubble(
  context: CanvasRenderingContext2D,
  line: DialogueLine,
  venue: VenueKind,
  tailLeft: boolean,
): void {
  const palette = PALETTES[venue];
  const shown = line.emotes.slice(0, line.reveal);
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.imageSmoothingEnabled = false;

  // Pixel-stepped shadow and frame; intentionally no smooth browser bubble.
  context.fillStyle = 'rgba(20, 14, 24, 0.38)';
  context.fillRect(18, 14, 226, 76);
  context.fillRect(26, 90, 38, 8);
  context.fillStyle = palette.border;
  context.fillRect(10, 6, 226, 76);
  context.fillRect(18, 2, 210, 84);
  context.fillStyle = palette.paper;
  context.fillRect(14, 10, 218, 68);
  context.fillRect(22, 6, 202, 76);
  context.fillStyle = palette.light;
  context.fillRect(22, 10, 194, 5);
  context.fillStyle = palette.accent;
  context.fillRect(20, 71, line.kind === 'moment' ? 48 : line.kind === 'order' ? 32 : 22, 3);

  context.beginPath();
  if (tailLeft) {
    context.moveTo(40, 78);
    context.lineTo(67, 78);
    context.lineTo(34, 104);
    context.lineTo(42, 84);
  } else {
    context.moveTo(188, 78);
    context.lineTo(215, 78);
    context.lineTo(222, 104);
    context.lineTo(207, 84);
  }
  context.closePath();
  context.fillStyle = palette.border;
  context.fill();
  context.beginPath();
  if (tailLeft) {
    context.moveTo(45, 78);
    context.lineTo(61, 78);
    context.lineTo(39, 96);
  } else {
    context.moveTo(194, 78);
    context.lineTo(210, 78);
    context.lineTo(217, 96);
  }
  context.closePath();
  context.fillStyle = palette.paper;
  context.fill();

  const spacing = shown.length === 1 ? 0 : shown.length === 2 ? 60 : 52;
  const startX = shown.length === 1 ? 103 : shown.length === 2 ? 72 : 50;
  shown.forEach((emote, index) => drawEmoteIcon(context, emote, startX + index * spacing, 25, palette.ink, palette.accent));
  if (line.reveal < line.emotes.length) {
    const pulse = Math.floor(line.reveal / 2) % 3;
    for (let index = 0; index <= pulse; index += 1) context.fillRect(184 + index * 8, 61, 4, 4);
  }
}

export class SpeechBubble {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private lastSignature = '';

  constructor(name: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const context = this.canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Sprechblasen können in diesem Browser nicht erzeugt werden.');
    this.context = context;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    const geometry = new PlaneGeometry(2.42, 1.06);
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.025,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      opacity: 0,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = `speech:${name}`;
    this.mesh.renderOrder = 20_000;
    this.mesh.visible = false;
  }

  update(line: DialogueLine | undefined, venue: VenueKind, tailLeft: boolean, characterHeight: number): void {
    if (!line) {
      this.mesh.visible = false;
      this.mesh.material.opacity = 0;
      return;
    }
    const signature = `${venue}:${tailLeft}:${line.kind}:${line.emotes.join(',')}:${line.reveal}`;
    if (signature !== this.lastSignature) {
      drawPixelBubble(this.context, line, venue, tailLeft);
      this.texture.needsUpdate = true;
      this.lastSignature = signature;
    }
    this.mesh.visible = true;
    this.mesh.material.opacity = line.opacity;
    this.mesh.scale.setScalar(line.scale);
    this.mesh.position.set(tailLeft ? 0.62 : -0.62, characterHeight + 0.62 + line.bob, 0.03);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}

export const SPEECH_BUBBLE_RESOLUTION = `${WIDTH}x${HEIGHT}`;
