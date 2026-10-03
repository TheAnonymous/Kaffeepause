import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { CafeSimulation } from '../simulation/cafeSimulation';
import type { VenueKind } from '../venue';
import type { RenderQualityTier } from './renderQuality';
import type { SceneSnapshot } from './types';
import type { PointerSample } from '../diorama/pointerReaction';
import type { AtmosphereSnapshot } from '../atmosphere/types';

export type RendererState = 'loading' | 'ready' | 'failed';

/** Was ein Klick ins Diorama getroffen hat. */
export interface ClickResult {
  readonly kind: 'guest' | 'barista' | 'cat' | 'lucky-cat' | 'bell';
  readonly id?: string;
}

export interface RendererFrameMetrics {
  readonly cpuMs: number;
  readonly gpuMs?: number;
}

export interface RendererLifecycleOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: CafeCamera;
  readonly simulation: CafeSimulation;
  readonly qualityTier: RenderQualityTier;
}

export interface RendererLifecycle {
  start(): void;
  stop(): void;
  update(deltaSeconds: number): SceneSnapshot;
  renderOnce(elapsed: number, snapshot?: SceneSnapshot): RendererFrameMetrics;
  renderVisualOnce(elapsed: number, snapshot?: SceneSnapshot): RendererFrameMetrics;
  resize(reducedMotion: boolean): void;
  setVenue(venue: VenueKind): void;
  setEnvironment(snapshot: CafeEnvironmentSnapshot): void;
  setAtmosphere(snapshot: AtmosphereSnapshot): void;
  setQualityTier(tier: RenderQualityTier): void;
  setPointerSample(sample: PointerSample): void;
  clearPointerSample(): void;
  /** Führt einen Klick aus (winken, Mochi rufen, klingeln) und sagt, was getroffen wurde. */
  handleClick(clientX: number, clientY: number): ClickResult | undefined;
  /** Ob an dieser Stelle etwas Anklickbares ist (für den Mauszeiger). */
  interactiveAt(clientX: number, clientY: number): boolean;
  dispose(): void;
}

/** Keeps the initial application chunk independent of Three.js. */
export async function loadRendererLifecycle(options: RendererLifecycleOptions): Promise<RendererLifecycle> {
  const { createWebglRendererLifecycle } = await import('./webglRendererLifecycle');
  return createWebglRendererLifecycle(options);
}
