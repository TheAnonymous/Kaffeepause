import { CafeAudio } from './audio';
import { CafeCamera } from './camera';
import { CafeRenderer } from './renderer';
import { CafeSimulation } from './simulation/cafeSimulation';

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Erwartetes Element fehlt: ${selector}`);
  return element;
}

export class KaffeepauseApp {
  private readonly canvas = requiredElement<HTMLCanvasElement>('#cafe');
  private readonly welcome = requiredElement<HTMLElement>('[data-testid="welcome"]');
  private readonly enterButton = requiredElement<HTMLButtonElement>('[data-testid="enter"]');
  private readonly soundButton = requiredElement<HTMLButtonElement>('[data-testid="sound"]');
  private readonly status = requiredElement<HTMLElement>('#status');
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly simulation = new CafeSimulation();
  private readonly camera = new CafeCamera();
  private readonly audio = new CafeAudio();
  private readonly renderer = new CafeRenderer(this.canvas, this.simulation, this.camera);
  private entered = false;
  private frame = 0;
  private lastFrame = performance.now();
  private elapsed = 0;

  start(): void {
    this.updateMotionPreference();
    this.renderer.render(0);
    this.enterButton.addEventListener('click', this.enterCafe);
    this.soundButton.addEventListener('click', this.toggleSound);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.motionQuery.addEventListener('change', this.updateMotionPreference);
    window.addEventListener('pagehide', this.destroy, { once: true });
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly enterCafe = (): void => {
    if (this.entered) return;
    this.entered = true;
    this.simulation.start();
    this.renderer.setActive(true);
    this.welcome.classList.add('is-hidden');
    this.soundButton.hidden = false;
    document.body.dataset.entered = 'true';
    this.status.textContent = 'Du bist im Café. Regen und leise Musik erfüllen den Raum.';
    void this.audio.start().then((state) => {
      this.soundButton.dataset.audioState = state;
      if (state === 'unavailable') {
        this.soundButton.disabled = true;
        this.soundButton.setAttribute('aria-label', 'Ton ist in diesem Browser nicht verfügbar');
      }
    });
  };

  private readonly toggleSound = (): void => {
    const muted = this.audio.toggleMuted();
    this.soundButton.setAttribute('aria-pressed', String(muted));
    this.soundButton.setAttribute('aria-label', muted ? 'Ton einschalten' : 'Ton ausschalten');
    this.soundButton.dataset.audioState = this.audio.getState();
    this.status.textContent = muted ? 'Der Ton ist aus.' : 'Der Ton ist an.';
  };

  private readonly tick = (now: number): void => {
    const delta = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.entered) {
      this.elapsed += delta;
      this.simulation.update(delta);
      this.camera.update(delta);
    }
    this.renderer.render(this.elapsed);
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly resize = (): void => {
    this.renderer.resize(this.motionQuery.matches);
    this.renderer.render(this.elapsed);
  };

  private readonly updateMotionPreference = (): void => {
    document.body.dataset.reducedMotion = String(this.motionQuery.matches);
    this.renderer.resize(this.motionQuery.matches);
  };

  private readonly visibilityChanged = (): void => {
    this.audio.fadeForVisibility(document.hidden);
    this.lastFrame = performance.now();
  };

  private readonly destroy = (): void => {
    cancelAnimationFrame(this.frame);
    this.simulation.stop();
    void this.audio.destroy();
  };
}
