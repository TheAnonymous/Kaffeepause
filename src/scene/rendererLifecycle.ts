import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { CafeSimulation } from '../simulation/cafeSimulation';
import type { VenueKind } from '../venue';
import type { RenderQualityTier } from './renderQuality';
import type { SceneSnapshot } from './types';
import type { PointerSample } from '../diorama/pointerReaction';

export type RendererState = 'loading' | 'ready' | 'failed';

export interface RendererFrameMetrics {
  readonly cpuMs: number;
  readonly gpuMs?: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly estimatedTextureBytes: number;
  readonly characterCacheSize: number;
  readonly renderTargets: number;
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
  setQualityTier(tier: RenderQualityTier): void;
  setPointerSample(sample: PointerSample): void;
  clearPointerSample(): void;
  dispose(): void;
}

/** Keeps the initial application chunk independent of Three.js. */
export async function loadRendererLifecycle(options: RendererLifecycleOptions): Promise<RendererLifecycle> {
  const { createWebglRendererLifecycle } = await import('./webglRendererLifecycle');
  return createWebglRendererLifecycle(options);
}
