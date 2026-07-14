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

const WIDTH = 256;
const HEIGHT = 112;

const PALETTES: Readonly<Record<VenueKind, { paper: string; light: string; ink: string; border: string; accent: string }>> = {
  cafe: { paper: '#f2dfb6', light: '#fff2cd', ink: '#3a2830', border: '#71483e', accent: '#c47a55' },
  ramen: { paper: '#f0d8ab', light: '#ffe9bc', ink: '#41232a', border: '#8c3838', accent: '#d65545' },
  arcade: { paper: '#d8eef0', light: '#effdff', ink: '#17243c', border: '#315a78', accent: '#cf55b8' },
};

function drawPixelBubble(
  context: CanvasRenderingContext2D,
  line: DialogueLine,
  venue: VenueKind,
  tailLeft: boolean,
): void {
  const palette = PALETTES[venue];
  const shown = line.romanized.slice(0, line.reveal);
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

  context.fillStyle = palette.ink;
  context.font = 'bold 18px "Courier New", monospace';
  context.textBaseline = 'top';
  const words = shown.split(' ');
  let lineText = '';
  let row = 0;
  for (const word of words) {
    const candidate = lineText ? `${lineText} ${word}` : word;
    if (candidate.length > 18 && lineText) {
      context.fillText(lineText, 27, 24 + row * 23);
      row += 1;
      lineText = word;
    } else {
      lineText = candidate;
    }
  }
  if (lineText && row < 2) context.fillText(lineText, 27, 24 + row * 23);
  if (line.reveal < line.romanized.length) {
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
    const signature = `${venue}:${tailLeft}:${line.kind}:${line.romanized}:${line.reveal}`;
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
