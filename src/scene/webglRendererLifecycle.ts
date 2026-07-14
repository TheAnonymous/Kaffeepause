import { CafeRenderer } from '../renderer';
import { SceneRuntime } from './sceneRuntime';
import type { RendererLifecycle, RendererLifecycleOptions } from './rendererLifecycle';
import type { RenderQualityTier } from './renderQuality';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { VenueKind } from '../venue';
import type { SceneSnapshot } from './types';

class WebglRendererLifecycle implements RendererLifecycle {
  private readonly renderer: CafeRenderer;
  private readonly runtime: SceneRuntime;

  constructor(private readonly options: RendererLifecycleOptions) {
    this.renderer = new CafeRenderer(options.canvas, options.camera, options.qualityTier);
    this.runtime = new SceneRuntime(options.simulation, options.camera, this.renderer);
  }

  start(): void {
    this.runtime.start();
  }

  stop(): void {
    this.runtime.stop();
  }

  update(deltaSeconds: number): SceneSnapshot {
    return this.runtime.update(deltaSeconds);
  }

  renderOnce(elapsed: number, snapshot?: SceneSnapshot): void {
    this.runtime.render(elapsed, snapshot);
  }

  resize(reducedMotion: boolean): void {
    this.renderer.resize(reducedMotion);
  }

  setVenue(venue: VenueKind): void {
    this.options.simulation.setVenue(venue);
    this.renderer.setVenue(venue);
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.options.simulation.setEnvironment(snapshot);
    this.renderer.setEnvironment(snapshot);
  }

  setQualityTier(tier: RenderQualityTier): void {
    this.renderer.setQualityTier(tier);
  }

  dispose(): void {
    this.runtime.stop();
    this.renderer.dispose();
  }
}

export function createWebglRendererLifecycle(options: RendererLifecycleOptions): RendererLifecycle {
  return new WebglRendererLifecycle(options);
}
