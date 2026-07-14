import type { VenueKind } from '../venue';
import type { SceneLighting } from './lightingRenderer';
import { RENDER_QUALITY } from './renderQuality';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

export interface Hd2dState {
  readonly bloom: number;
  readonly haze: number;
  readonly vignette: number;
  readonly bokeh: number;
  readonly depth: number;
  readonly rim: number;
}

interface DioramaFrame {
  readonly context: CanvasRenderingContext2D;
  readonly venue: VenueKind;
  readonly time: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly state: Hd2dState;
}

interface DioramaPalette {
  readonly bloom: string;
  readonly haze: string;
  readonly bokeh: string;
  readonly vignette: string;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function paletteForVenue(venue: VenueKind): DioramaPalette {
  if (venue === 'ramen') return { bloom: '#f6ab5c', haze: '#d87558', bokeh: '#f5c879', vignette: '#261928' };
  if (venue === 'arcade') return { bloom: '#6be2d3', haze: '#526eb3', bokeh: '#d76cb3', vignette: '#08111f' };
  return { bloom: '#f6c675', haze: '#bd775e', bokeh: '#ffe0a0', vignette: '#241923' };
}

// Der Pass übersetzt die Pixel-Szene in ein leuchtendes Miniatur-Diorama: Licht bleibt punktuell, die Figuren lesbar.
export function calculateHd2dState(lighting: SceneLighting): Hd2dState {
  const lowLight = 1 - lighting.solar;
  return {
    bloom: clamp(0.16 + lighting.night * 0.47 + lighting.wetness * 0.15 + lowLight * 0.12),
    haze: clamp(0.045 + lighting.fog * 0.18 + lighting.wetness * 0.055 + lighting.night * 0.04),
    vignette: clamp(0.10 + lighting.night * 0.12 + lighting.fog * 0.07),
    bokeh: clamp(0.10 + lighting.night * 0.24 + lighting.wetness * 0.08),
    depth: clamp(0.17 + lighting.fog * 0.15 + lighting.night * 0.05),
    rim: clamp(0.34 + lighting.night * 0.31 + lighting.wetness * 0.14),
  };
}

export class Hd2dRenderer {
  private bloomCanvas?: HTMLCanvasElement;
  private compositeFrame = 0;
  private bloomSourceWidth = 0;
  private bloomSourceHeight = 0;

  constructor(private readonly rect: Rect, private readonly polygon: Polygon, private readonly pixel: number) {}

  drawBackAtmosphere(frame: DioramaFrame): void {
    const { context, venue, time, active, reducedMotion, state } = frame;
    const palette = paletteForVenue(venue);
    const lamps = venue === 'ramen' ? [76, 146, 216, 286, 350] : venue === 'arcade' ? [74, 146, 218, 290, 352] : [78, 150, 224, 302, 354];
    const pulse = active && !reducedMotion ? Math.sin(time * 1.1) * this.pixel : 0;

    // Gestaffelte Pixel-Lichtflächen statt eines Vollbild-Filters halten die Szene auch auf schwachen Geräten direkt bedienbar.
    context.save();
    context.globalAlpha = state.bloom * 0.42;
    context.globalCompositeOperation = 'screen';
    for (const x of lamps) {
      this.polygon(context, palette.bloom, [[x - 12, 19], [x + 12, 19], [x + 24, 70], [x - 24, 70]]);
      this.rect(context, palette.bloom, x - 8, 18 + pulse, 16, 9);
    }
    this.polygon(context, palette.haze, [[52, 104], [250, 104], [279, 139], [28, 139]]);
    context.restore();

    context.save();
    context.globalAlpha = state.haze;
    this.polygon(context, palette.haze, [[43, 112], [256, 112], [283, 132], [20, 132]]);
    this.rect(context, palette.bloom, 62, 126 + pulse, 182, this.pixel);
    context.restore();
  }

  drawLensPass(frame: DioramaFrame): void {
    const { context, venue, time, active, reducedMotion, state } = frame;
    const palette = paletteForVenue(venue);
    const focusX = 157;
    const focusY = 158;

    context.save();
    const focusLight = context.createRadialGradient(focusX, focusY, 18, focusX, focusY, 121);
    focusLight.addColorStop(0, `rgba(255, 232, 174, ${0.025 + state.bloom * 0.05})`);
    focusLight.addColorStop(1, 'rgba(255, 232, 174, 0)');
    context.globalCompositeOperation = 'screen';
    context.fillStyle = focusLight;
    context.fillRect(28, 88, 258, 122);
    context.restore();

    context.save();
    const vignette = context.createRadialGradient(focusX, focusY, 72, focusX, focusY, 258);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.62, `rgba(0, 0, 0, ${state.vignette * 0.22})`);
    vignette.addColorStop(1, `${palette.vignette}${Math.round(state.vignette * 150).toString(16).padStart(2, '0')}`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, 384, 216);
    context.restore();

    if (!active) return;
    const drift = reducedMotion ? 0 : Math.sin(time * 0.55) * this.pixel;
    context.save();
    context.globalAlpha = state.bokeh * 0.45;
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < (reducedMotion ? 4 : 9); index += 1) {
      const left = index % 2 === 0;
      const x = left ? 18 + ((index * 19) % 42) : 307 + ((index * 23) % 48);
      const y = 34 + ((index * 29) % 139) + drift;
      const size = index % 3 === 0 ? 2 : 1;
      this.rect(context, palette.bokeh, x, y, size, size);
    }
    context.restore();
  }

  // Der Master-Pass arbeitet nach dem eigentlichen Welt-Rendering in echten
  // Canvaspixeln. Ein kleiner Lichtpuffer erzeugt Bloom, ohne die Spritekonturen
  // zu verwischen; nur die äußersten Tiefenebenen erhalten eine sanfte Unschärfe.
  composeMaster(canvas: HTMLCanvasElement, state: Hd2dState, venue: VenueKind): void {
    if (typeof document === 'undefined') return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    const bufferWidth = Math.max(1, Math.ceil(canvas.width / RENDER_QUALITY.bloomDownsample));
    const bufferHeight = Math.max(1, Math.ceil(canvas.height / RENDER_QUALITY.bloomDownsample));
    const buffer = this.ensureBloomCanvas(bufferWidth, bufferHeight);
    const bufferContext = buffer.getContext('2d', { alpha: false });
    if (!bufferContext) return;

    const sizeChanged = this.bloomSourceWidth !== canvas.width || this.bloomSourceHeight !== canvas.height;
    if (sizeChanged || this.compositeFrame % 6 === 0) {
      bufferContext.setTransform(1, 0, 0, 1, 0, 0);
      bufferContext.imageSmoothingEnabled = true;
      bufferContext.clearRect(0, 0, bufferWidth, bufferHeight);
      bufferContext.drawImage(canvas, 0, 0, bufferWidth, bufferHeight);
      this.bloomSourceWidth = canvas.width;
      this.bloomSourceHeight = canvas.height;
    }
    this.compositeFrame += 1;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = 0.04 + state.bloom * 0.1;
    context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    context.restore();

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.globalAlpha = state.depth * 0.18;
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height * 0.19);
    context.rect(0, canvas.height * 0.94, canvas.width, canvas.height * 0.06);
    context.clip();
    context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    context.restore();

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = venue === 'arcade' ? 0.075 : 0.055;
    context.fillStyle = venue === 'arcade' ? '#315e8f' : venue === 'ramen' ? '#a94d39' : '#9f6546';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.imageSmoothingEnabled = false;
  }

  private ensureBloomCanvas(width: number, height: number): HTMLCanvasElement {
    if (!this.bloomCanvas) this.bloomCanvas = document.createElement('canvas');
    if (this.bloomCanvas.width !== width) this.bloomCanvas.width = width;
    if (this.bloomCanvas.height !== height) this.bloomCanvas.height = height;
    return this.bloomCanvas;
  }
}
