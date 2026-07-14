import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { CafeSimulation } from '../simulation/cafeSimulation';
import type { VenueKind } from '../venue';
import type { RenderQualityTier } from './renderQuality';
import type { SceneSnapshot } from './types';
import type { PointerSample } from '../diorama/pointerReaction';

export type RendererState = 'loading' | 'ready' | 'failed';

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
  renderOnce(elapsed: number, snapshot?: SceneSnapshot): void;
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
