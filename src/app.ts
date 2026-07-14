import { CafeAudio } from './audio';
import { CafeCamera } from './camera';
import { CafeRenderer } from './renderer';
import { CafeSimulation, type CafeSimulationOptions } from './simulation/cafeSimulation';
import type { AccidentKind, CafeMoment, CafeMomentKind, CafeStoryKind } from './simulation/types';
import { CafeEnvironmentController, parseEnvironmentOverrides } from './environment/cafeEnvironmentController';
import type { CafeEnvironmentSnapshot } from './environment/types';

const UI_IDLE_DELAY = 2_500;

const ACCIDENT_MESSAGES: Readonly<Record<AccidentKind, string>> = {
  'tray-drop': 'Oh! Dem Barista ist ein Tablett heruntergefallen. Schon wird aufgeräumt.',
  'coffee-spill': 'Hoppla! Ein Gast hat Kaffee verschüttet und wischt den Tisch sauber.',
  'umbrella-pop': 'Plopp! Ein Regenschirm ist im Café aufgegangen und wird wieder eingefangen.',
};

const MOMENT_MESSAGES: Readonly<Record<CafeMomentKind, string>> = {
  'shared-cake': 'Zwei Gäste teilen sich ein Stück Kuchen und bleiben noch ein wenig länger.',
  'card-game': 'An einem Tisch beginnt eine kleine Kartenrunde.',
  'window-gaze': 'Ein Gast hält inne und schaut dem Wetter draußen zu.',
  'sketch-reveal': 'Eine neue Skizze bekommt ihren letzten kleinen Strich.',
  'first-date-toast': 'Zwei Tassen stoßen ganz vorsichtig auf einen gelungenen Abend an.',
  'knit-gift': 'Ein kleines gestricktes Geschenk wechselt über den Tisch.',
};

const STORY_MESSAGES: Readonly<Record<CafeStoryKind, readonly [string, string]>> = {
  sketchbook: [
    'Mara schlägt ihr abgewetztes Skizzenbuch auf und arbeitet an einer neuen Zeichnung.',
    'Mara hängt ihre fertige kleine Skizze neben dem Fenster auf.',
  ],
  'first-date': [
    'Noor und Toni teilen sich zaghaft ein Stück Kuchen und bleiben noch ein wenig sitzen.',
    'Noor und Toni stoßen leise an – aus dem ersten Treffen ist ein guter Abend geworden.',
  ],
  'knit-gift': [
    'Linn legt jemandem gegenüber ein kleines selbstgestricktes Geschenk hin.',
    'Linn legt jemandem gegenüber ein kleines selbstgestricktes Geschenk hin.',
  ],
};

function momentMessage(moment: Readonly<CafeMoment>): string {
  if (!moment.story || !moment.storyStep) return MOMENT_MESSAGES[moment.kind];
  return STORY_MESSAGES[moment.story][moment.storyStep - 1] ?? MOMENT_MESSAGES[moment.kind];
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Erwartetes Element fehlt: ${selector}`);
  return element;
}

function simulationOptions(): CafeSimulationOptions {
  if (!import.meta.env.DEV) return {};
  const parameters = new URLSearchParams(window.location.search);
  const options: CafeSimulationOptions = {};
  const requested = parameters.get('accident');
  const kinds: readonly AccidentKind[] = ['tray-drop', 'coffee-spill', 'umbrella-pop'];
  if (kinds.includes(requested as AccidentKind)) {
    const kind = requested as AccidentKind;
    options.initialGuests = kind === 'umbrella-pop' ? 3 : 4;
    options.accidents = {
      seed: 0xe2e_2026,
      minDelaySeconds: kind === 'umbrella-pop' ? 1.5 : 0.35,
      maxDelaySeconds: kind === 'umbrella-pop' ? 1.5 : 0.35,
      kinds: [kind],
      phaseDurationScale: 0.6,
    };
  }
  const requestedMoment = parameters.get('moment');
  const momentKinds: readonly CafeMomentKind[] = ['shared-cake', 'card-game', 'window-gaze', 'sketch-reveal'];
  if (momentKinds.includes(requestedMoment as CafeMomentKind)) {
    options.initialGuests = Math.max(options.initialGuests ?? 0, requestedMoment === 'window-gaze' ? 2 : 4);
    options.moments = {
      seed: 0x51ce_2026,
      minDelaySeconds: 0.35,
      maxDelaySeconds: 0.35,
      kinds: [requestedMoment as CafeMomentKind],
      durationScale: 0.45,
    };
  }
  const requestedStory = parameters.get('story');
  const storyKinds: readonly CafeStoryKind[] = ['sketchbook', 'first-date', 'knit-gift'];
  if (storyKinds.includes(requestedStory as CafeStoryKind)) {
    options.initialGuests = Math.max(options.initialGuests ?? 0, 4);
    options.moments = false;
    options.stories = {
      seed: 0x5707_2026,
      minDelaySeconds: 0.35,
      maxDelaySeconds: 0.35,
      kinds: [requestedStory as CafeStoryKind],
    };
  }
  return options;
}

export class KaffeepauseApp {
  private readonly canvas = requiredElement<HTMLCanvasElement>('#cafe');
  private readonly welcome = requiredElement<HTMLElement>('[data-testid="welcome"]');
  private readonly enterButton = requiredElement<HTMLButtonElement>('[data-testid="enter"]');
  private readonly controls = requiredElement<HTMLElement>('[data-testid="controls"]');
  private readonly soundButton = requiredElement<HTMLButtonElement>('[data-testid="sound"]');
  private readonly fullscreenButton = requiredElement<HTMLButtonElement>('[data-testid="fullscreen"]');
  private readonly fullscreenLabel = requiredElement<HTMLElement>('[data-fullscreen-label]');
  private readonly status = requiredElement<HTMLElement>('#status');
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly simulation = new CafeSimulation(simulationOptions());
  private readonly camera = new CafeCamera();
  private readonly audio = new CafeAudio();
  private readonly renderer = new CafeRenderer(this.canvas, this.simulation, this.camera);
  private readonly environment = new CafeEnvironmentController({
    overrides: parseEnvironmentOverrides(window.location.search, import.meta.env.DEV),
    onNotice: (message) => { this.status.textContent = message; },
  });
  private entered = false;
  private frame = 0;
  private lastFrame = performance.now();
  private elapsed = 0;
  private idleTimer?: number;
  private lastAnnouncedAccidentId = 0;
  private lastAnnouncedMomentId = 0;

  start(): void {
    this.updateMotionPreference();
    this.environment.start();
    this.applyEnvironment(this.environment.update());
    this.renderer.render(0);
    this.enterButton.addEventListener('click', this.enterCafe);
    this.soundButton.addEventListener('click', this.toggleSound);
    this.fullscreenButton.addEventListener('click', this.toggleFullscreen);
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.noteActivity);
    window.addEventListener('pointerdown', this.noteActivity);
    window.addEventListener('keydown', this.keyPressed);
    window.addEventListener('focus', this.noteActivity);
    document.addEventListener('focusin', this.noteActivity);
    document.addEventListener('fullscreenchange', this.fullscreenChanged);
    document.addEventListener('fullscreenerror', this.fullscreenFailed);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.motionQuery.addEventListener('change', this.updateMotionPreference);
    window.addEventListener('pagehide', this.destroy, { once: true });
    document.body.dataset.uiIdle = 'false';
    this.updateFullscreenState();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly enterCafe = (): void => {
    if (this.entered) return;
    this.entered = true;
    this.simulation.start();
    this.renderer.setActive(true);
    this.welcome.classList.add('is-hidden');
    this.controls.hidden = false;
    document.body.dataset.entered = 'true';
    this.setUiIdle(false);
    this.scheduleIdle();
    this.status.textContent = 'Du bist im Café. Regen und leise Musik erfüllen den Raum.';
    void this.audio.start().then((state) => {
      this.soundButton.dataset.audioState = state;
      if (state === 'unavailable') {
        this.soundButton.disabled = true;
        this.soundButton.setAttribute('aria-label', 'Ton ist in diesem Browser nicht verfügbar');
      }
    });
  };

  private readonly toggleFullscreen = async (): Promise<void> => {
    this.noteActivity();
    if (!this.supportsFullscreen()) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.status.textContent = 'Vollbild konnte nicht geöffnet werden.';
      this.updateFullscreenState();
      this.resize();
    }
  };

  private readonly fullscreenChanged = (): void => {
    this.updateFullscreenState();
    this.resize();
  };

  private readonly fullscreenFailed = (): void => {
    this.status.textContent = 'Vollbild ist in diesem Browser nicht verfügbar.';
    this.updateFullscreenState();
    this.resize();
  };

  private updateFullscreenState(): void {
    const supported = this.supportsFullscreen();
    const fullscreen = supported && document.fullscreenElement === document.documentElement;
    this.fullscreenButton.hidden = !supported;
    this.fullscreenButton.setAttribute('aria-pressed', String(fullscreen));
    const label = fullscreen ? 'Vollbild verlassen' : 'Vollbild öffnen';
    this.fullscreenButton.setAttribute('aria-label', label);
    this.fullscreenLabel.textContent = label;
    document.body.dataset.fullscreen = String(fullscreen);
  }

  private supportsFullscreen(): boolean {
    return typeof document.documentElement.requestFullscreen === 'function'
      && typeof document.exitFullscreen === 'function'
      && document.fullscreenEnabled !== false;
  }

  private readonly noteActivity = (): void => {
    if (!this.entered) return;
    this.setUiIdle(false);
    this.scheduleIdle();
  };

  private readonly keyPressed = (event: KeyboardEvent): void => {
    this.noteActivity();
    if (event.key !== 'Escape' || !document.fullscreenElement || !this.supportsFullscreen()) return;
    void document.exitFullscreen().catch(() => this.fullscreenFailed());
  };

  private scheduleIdle(): void {
    if (this.idleTimer !== undefined) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.controls.contains(document.activeElement)) {
        this.scheduleIdle();
        return;
      }
      this.setUiIdle(true);
    }, UI_IDLE_DELAY);
  }

  private setUiIdle(idle: boolean): void {
    document.body.dataset.uiIdle = String(idle);
  }

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
    this.applyEnvironment(this.environment.update());
    if (this.entered) {
      this.elapsed += delta;
      this.simulation.update(delta);
      this.camera.update(delta);
      const accident = this.simulation.activeAccident;
      if (accident && accident.id !== this.lastAnnouncedAccidentId) {
        this.lastAnnouncedAccidentId = accident.id;
        this.status.textContent = ACCIDENT_MESSAGES[accident.kind];
        this.audio.playAccident(accident.kind);
      }
      const moment = this.simulation.activeMoment;
      if (moment && moment.id !== this.lastAnnouncedMomentId) {
        this.lastAnnouncedMomentId = moment.id;
        this.status.textContent = momentMessage(moment);
        this.audio.playMoment(moment.kind);
      }
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
    this.environment.visibilityChanged(document.hidden);
    this.lastFrame = performance.now();
  };

  private readonly destroy = (): void => {
    cancelAnimationFrame(this.frame);
    if (this.idleTimer !== undefined) window.clearTimeout(this.idleTimer);
    this.environment.stop();
    this.simulation.stop();
    void this.audio.destroy();
  };

  private applyEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.simulation.setEnvironment(snapshot);
    this.renderer.setEnvironment(snapshot);
    this.audio.setAtmosphere(snapshot, this.simulation.guests.length);
    const datasets = [document.body.dataset, this.canvas.dataset];
    for (const dataset of datasets) {
      dataset.dayPhase = snapshot.dayPhase;
      dataset.weather = snapshot.weather.kind;
      dataset.weatherSource = snapshot.weatherSource;
      dataset.localTime = snapshot.localTimeText;
      dataset.locationState = snapshot.locationState;
      dataset.crowdTarget = String(snapshot.targetCrowd);
    }
  }
}
