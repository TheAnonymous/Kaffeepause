import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { VenueKind } from '../venue';

type Rect = (context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) => void;
type Polygon = (context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]) => void;

export interface SceneLighting {
  readonly solar: number;
  readonly wetness: number;
  readonly night: number;
  readonly fog: number;
  readonly fromRight: boolean;
  readonly glow: string;
  readonly reflection: string;
}

interface LightingFrame {
  readonly context: CanvasRenderingContext2D;
  readonly venue: VenueKind;
  readonly time: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly lighting: SceneLighting;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function fogPresence(environment?: CafeEnvironmentSnapshot): number {
  const weather = environment?.weather;
  if (!weather) return 0;
  if (weather.kind === 'fog') return weather.transitionProgress;
  return weather.previousKind === 'fog' ? 1 - weather.transitionProgress : 0;
}

export function calculateSceneLighting(venue: VenueKind, environment?: CafeEnvironmentSnapshot): SceneLighting {
  const weather = environment?.weather;
  const solar = clamp(((environment?.solar.elevation ?? -12) + 8) / 58);
  const wetness = clamp(((weather?.rain ?? 0) + (weather?.showers ?? 0)) / 4 + (weather?.kind === 'storm' ? 0.55 : 0));
  const night = environment?.dayPhase === 'night'
    ? 1
    : environment?.dayPhase === 'evening' || environment?.dayPhase === 'dusk'
      ? 0.72
      : environment?.dayPhase === 'dawn'
        ? 0.42
        : 0.08;
  const glow = venue === 'ramen' ? '#f1a25e' : venue === 'arcade' ? '#5cced0' : '#f0b66b';
  const reflection = venue === 'ramen' ? '#d45c4d' : venue === 'arcade' ? '#5fcbd0' : '#d49a61';
  return {
    solar,
    wetness,
    night,
    fog: fogPresence(environment),
    fromRight: (environment?.solar.azimuth ?? 180) > 180,
    glow,
    reflection,
  };
}

// Ein kleiner, bewusst pixeliger Lichtpass: keine weichen Filter, damit das Diorama klar bleibt.
export class LightingRenderer {
  constructor(private readonly rect: Rect, private readonly polygon: Polygon, private readonly pixel: number) {}

  drawAmbient(frame: LightingFrame): void {
    const { context, venue, time, reducedMotion, active, lighting } = frame;
    const movement = active && !reducedMotion ? Math.sin(time * 0.75) * this.pixel : 0;

    const directLight = lighting.solar * (1 - lighting.wetness * 0.35) * (1 - lighting.fog * 0.6);
    if (directLight > 0.025) {
      context.save();
      context.globalAlpha = 0.035 + directLight * 0.16;
      if (lighting.fromRight) {
        this.polygon(context, '#ffe3a0', [[248, 104], [218, 104], [116, 211], [213, 211]]);
      } else {
        this.polygon(context, '#ffe3a0', [[53, 104], [84, 104], [204, 211], [107, 211]]);
      }
      context.restore();
    }

    const lampStrength = 0.04 + lighting.night * 0.13 + (1 - lighting.solar) * 0.035;
    const lampPositions = venue === 'ramen'
      ? [76, 146, 216, 286, 350]
      : venue === 'arcade'
        ? [74, 146, 218, 290, 352]
        : [78, 150, 224, 302, 354];
    context.save();
    context.globalAlpha = lampStrength;
    for (const x of lampPositions) {
      this.polygon(context, lighting.glow, [[x - 8, 116], [x + 8, 116], [x + 27, 207], [x - 27, 207]]);
      this.rect(context, '#ffe1a0', x - 4, 119 + movement, 8, this.pixel);
    }
    context.restore();

    if (lighting.wetness <= 0.02) return;
    const shimmer = active && !reducedMotion ? Math.sin(time * 1.25) * this.pixel : 0;
    const reflectionAlpha = 0.035 + lighting.wetness * 0.12;
    context.save();
    context.globalAlpha = reflectionAlpha;
    for (let index = 0; index < 18; index += 1) {
      const x = 50 + ((index * 29) % 188);
      const y = 178 + ((index * 11) % 27);
      const width = 4 + (index % 4) * 3;
      const offset = index % 3 === 0 ? shimmer : 0;
      this.rect(context, lighting.reflection, x, y + offset, width, this.pixel);
      if (index % 3 === 0) this.rect(context, '#f3d58c', x + 2, y - this.pixel + offset, Math.max(2, width - 4), this.pixel);
    }
    context.restore();
  }

  drawForegroundDepth(frame: LightingFrame): void {
    const { context, venue, time, reducedMotion, active, lighting } = frame;
    const sway = active && !reducedMotion ? Math.sin(time * 0.9) * this.pixel * 2 : 0;

    if (venue === 'cafe') {
      this.rect(context, '#2d252e', 38, 197, 15, 13);
      this.rect(context, '#6f4a42', 40, 195, 11, 5);
      this.rect(context, '#9b654d', 41, 195, 9, this.pixel);
      this.rect(context, '#405a4f', 42 + sway, 184, 6, 14);
      this.rect(context, '#5e7e62', 37 + sway, 188, 7, 5);
      this.rect(context, '#70906c', 47 + sway, 181, 6, 8);
      this.rect(context, '#91a779', 50 + sway, 185, 4, 5);
    } else if (venue === 'ramen') {
      this.rect(context, '#2d2030', 37, 177, 16, 34);
      this.rect(context, '#713640', 39, 176, 12, 32);
      this.rect(context, '#c85249', 40, 177, 10, this.pixel);
      for (let y = 183; y < 204; y += 6) this.rect(context, '#e0a25e', 42, y + sway, 6, this.pixel);
      this.rect(context, '#442735', 35, 208, 20, 4);
    } else {
      this.rect(context, '#101827', 37, 178, 18, 33);
      this.rect(context, '#2c4561', 39, 180, 14, 27);
      this.rect(context, '#5ccbd0', 41, 182, 10, 10);
      this.rect(context, '#c55ca4', 42, 193 + sway, 8, this.pixel);
      this.rect(context, '#f0dc8b', 44, 184, 4, this.pixel);
      this.rect(context, '#0d1422', 35, 208, 22, 4);
    }

    if (lighting.wetness > 0.2) {
      context.save();
      context.globalAlpha = 0.14 + lighting.wetness * 0.12;
      this.rect(context, '#d5e0d7', 39, 211, 15, this.pixel);
      context.restore();
    }
  }
}
