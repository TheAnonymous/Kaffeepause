import { CafeCamera } from '../camera';
import { CafeRenderer } from '../renderer';
import { CafeSimulation } from '../simulation/cafeSimulation';
import type { SceneSnapshot } from './types';

// Schlanke Laufzeit für das Diorama: Update, Kamera und Rendern bleiben in fester Reihenfolge.
export class SceneRuntime {
  constructor(
    readonly simulation: CafeSimulation,
    readonly camera: CafeCamera,
    readonly renderer: CafeRenderer,
  ) {}

  start(): void {
    this.simulation.start();
    this.renderer.setActive(true);
  }

  stop(): void {
    this.renderer.setActive(false);
    this.simulation.stop();
  }

  update(deltaSeconds: number): SceneSnapshot {
    this.simulation.update(deltaSeconds);
    this.camera.update(deltaSeconds);
    return this.snapshot();
  }

  snapshot(): SceneSnapshot {
    return this.simulation.getSceneSnapshot();
  }

  render(elapsed: number, snapshot = this.snapshot()): void {
    this.renderer.render(elapsed, snapshot);
  }
}
