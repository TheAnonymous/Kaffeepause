import { WORLD_WIDTH } from './simulation/layout';

export type CameraMode = 'overview' | 'tour' | 'still';

export class CafeCamera {
  x = 0;
  mode: CameraMode = 'overview';

  private viewportWidth = WORLD_WIDTH;
  private reducedMotion = false;
  private stopIndex = 0;
  private pauseRemaining = 4;
  private direction: 1 | -1 = 1;

  configure(viewportWidth: number, mobile: boolean, reducedMotion: boolean): void {
    this.viewportWidth = viewportWidth;
    this.reducedMotion = reducedMotion;
    if (!mobile) {
      this.mode = 'overview';
      this.x = 0;
      return;
    }
    if (reducedMotion) {
      this.mode = 'still';
      this.x = Math.round(this.maxX() * 0.48);
      return;
    }
    this.mode = 'tour';
    this.x = Math.min(this.x, this.maxX());
  }

  update(deltaSeconds: number): void {
    if (this.mode !== 'tour' || this.reducedMotion) return;
    const stops = [0, this.maxX() * 0.48, this.maxX()];
    if (this.pauseRemaining > 0) {
      this.pauseRemaining -= deltaSeconds;
      return;
    }

    const target = stops[this.stopIndex] ?? 0;
    const distance = target - this.x;
    const step = Math.min(Math.abs(distance), deltaSeconds * 9);
    this.x += Math.sign(distance) * step;
    if (Math.abs(distance) > 0.2) return;

    this.x = target;
    this.pauseRemaining = 6.5;
    if (this.stopIndex === stops.length - 1) this.direction = -1;
    if (this.stopIndex === 0) this.direction = 1;
    this.stopIndex += this.direction;
  }

  private maxX(): number {
    return Math.max(0, WORLD_WIDTH - this.viewportWidth);
  }
}
