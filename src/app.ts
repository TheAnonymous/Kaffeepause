import { CafeAudio, REACTION_ACCENT_MAX_GAIN } from './audio';
import { CafeCamera } from './camera';
import { CafeSimulation, type CafeSimulationOptions } from './simulation/cafeSimulation';
import type { AccidentKind, CafeMoment, CafeMomentKind, CafeStoryKind } from './simulation/types';
import { CafeEnvironmentController, parseEnvironmentOverrides } from './environment/cafeEnvironmentController';
import type { CafeEnvironmentSnapshot } from './environment/types';
import { DEFAULT_VENUE, isVenueKind, VENUES, type VenueKind } from './venue';
import {
  loadRendererLifecycle,
  type RendererLifecycle,
  type RendererState,
} from './scene/rendererLifecycle';
import {
  FrameBudgetProbe,
  parseRenderQualityOverride,
  RenderQualityGovernor,
  type RenderQualityTier,
} from './scene/renderQuality';

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
  'coffee-tasting': 'Eine kleine Kaffeeverkostung bringt neue Aromen an den Tisch.',
  'ramen-slurp': 'Eine dampfende Ramen-Schüssel wird mit einem zufriedenen Schlürfen probiert.',
  'arcade-duel': 'Zwei Gäste fordern sich zu einer freundlichen Arcade-Runde heraus.',
  'arcade-high-score': 'Ein neuer Highscore lässt die kleinen Bildschirme kurz aufleuchten.',
  'umbrella-handoff': 'Zwei Gäste falten einen tropfenden Schirm zusammen und teilen ein Lächeln.',
  'foam-moustache': 'Ein kleiner Milchschaumbart sorgt am Café-Tisch für leises Gelächter.',
  'sugar-packet-domino': 'Zuckerpäckchen kippen wie Dominosteine über den Café-Tisch.',
  'steam-glasses': 'Der Ramendampf beschlägt eine Brille und wird lachend weggewischt.',
  'chopstick-drop': 'Ein Stäbchen fällt klappernd zu Boden und wird schnell aufgehoben.',
  'ticket-stream': 'Ein langer Ticketstreifen kringelt sich durch die Arcade-Halle.',
  'button-mash-sync': 'Zwei Gäste finden gleichzeitig denselben Arcade-Rhythmus.',
  'pastry-restock': 'Die Auslage wird in ruhigen Handgriffen wieder aufgefüllt.',
  'table-reset': 'Ein freier Tisch wird für den nächsten Besuch vorbereitet.',
  'window-rain-trace': 'Ein Finger folgt für einen Moment den Regentropfen am Fenster.',
  'pencil-return': 'Ein entliehener Stift findet wortlos zu seinem Platz zurück.',
  'warm-cup-offer': 'Eine warme Tasse wird vorsichtig über den Tisch gereicht.',
  'doorway-greeting': 'An der Tür wechseln zwei Menschen einen stillen Gruß.',
  'broth-lid-lift': 'Der Deckel hebt sich und warmer Dampf füllt kurz den Tresen.',
  'bowl-pass': 'Eine dampfende Schüssel wandert sicher über den Tresen.',
  'noren-gust': 'Ein Windstoß bewegt den Vorhang und alle Blicke folgen ihm.',
  'condiment-pass': 'Die Gewürzflasche wechselt mit einem kleinen Nicken den Platz.',
  'last-gyoza-offer': 'Das letzte Gyoza wird geteilt, ohne dass ein Wort nötig ist.',
  'napkin-save': 'Eine Serviette fängt einen kleinen Spritzer gerade noch auf.',
  'attract-mode-wave': 'Das Leuchten der Automaten läuft wie eine Welle durch den Raum.',
  'token-hopper-refill': 'Neue Münzen klimpern ruhig in den Hopper.',
  'cabinet-reboot': 'Ein Automat startet neu und findet sein vertrautes Leuchten wieder.',
  'ticket-trade': 'Zwei Ticketstreifen wechseln gegen ein dankbares Lächeln den Besitzer.',
  'coop-rescue': 'Ein zweites Paar Hände rettet wortlos die gemeinsame Runde.',
  'lounge-prize-share': 'Ein kleiner Gewinn wird auf der Lounge-Bank geteilt.',
};

const STORY_MESSAGES: Readonly<Record<CafeStoryKind, readonly string[]>> = {
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
  'arcade-rivals': [
    'Sora und Kai treffen sich an einem Tisch zur freundlichen Revanche.',
    'Sora und Kai feiern gemeinsam einen neuen Highscore – die Revanche bleibt offen.',
  ],
  'order-mixup': [
    'Bo und Cleo erhalten die falschen Getränke und schauen überrascht von Tasse zu Tasse.',
    'Bo und Cleo vergleichen die Bestellungen – dann wird der kleine Irrtum klar.',
    'Die Getränke werden getauscht, Bo und Cleo stoßen lachend miteinander an.',
  ],
  'noodle-mishap': [
    'Jun zieht eine erstaunlich lange Nudel aus der dampfenden Schüssel.',
    'Ein winziger Brühespritzer überrascht Jun und Emi am Ramen-Tisch.',
    'Jun und Emi lachen, reichen Servietten weiter und retten die Nudel.',
  ],
  'glitched-coop': [
    'Vor Ari und Mika flackert ein Arcade-Automat verdächtig auf.',
    'Die Steuerungen scheinen vertauscht – Ari und Mika spielen einfach gemeinsam weiter.',
    'Ein zufälliger Co-op-Sieg lässt Ari und Mika unter dem Highscore aufleuchten.',
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
    if (kind === 'umbrella-pop') options.durationScale = 0.1;
    options.accidents = {
      seed: 0xe2e_2026,
      minDelaySeconds: kind === 'umbrella-pop' ? 1.5 : 0.35,
      maxDelaySeconds: kind === 'umbrella-pop' ? 1.5 : 0.35,
      kinds: [kind],
      phaseDurationScale: 0.6,
    };
  }
  const requestedMoment = parameters.get('moment');
  const momentKinds: readonly CafeMomentKind[] = [
    'shared-cake', 'card-game', 'window-gaze', 'sketch-reveal', 'coffee-tasting',
    'ramen-slurp', 'arcade-duel', 'arcade-high-score', 'umbrella-handoff',
    'foam-moustache', 'sugar-packet-domino', 'steam-glasses', 'chopstick-drop',
    'ticket-stream', 'button-mash-sync',
    'pastry-restock', 'table-reset', 'window-rain-trace', 'pencil-return', 'warm-cup-offer', 'doorway-greeting',
    'broth-lid-lift', 'bowl-pass', 'noren-gust', 'condiment-pass', 'last-gyoza-offer', 'napkin-save',
    'attract-mode-wave', 'token-hopper-refill', 'cabinet-reboot', 'ticket-trade', 'coop-rescue', 'lounge-prize-share',
  ];
  if (momentKinds.includes(requestedMoment as CafeMomentKind)) {
    const requestedScale = Number(parameters.get('cinematicScale') ?? 1);
    const cinematicScale = Number.isFinite(requestedScale) ? Math.max(0.02, Math.min(1, requestedScale)) : 1;
    options.initialGuests = Math.max(options.initialGuests ?? 0,
      requestedMoment === 'lounge-prize-share' ? 7 : requestedMoment === 'window-gaze' ? 2 : 4);
    options.moments = {
      seed: 0x51ce_2026,
      minDelaySeconds: 0.35,
      maxDelaySeconds: 0.35,
      kinds: [requestedMoment as CafeMomentKind],
      durationScale: cinematicScale,
    };
  }
  const requestedStory = parameters.get('story');
  const storyKinds: readonly CafeStoryKind[] = [
    'sketchbook', 'first-date', 'knit-gift', 'arcade-rivals',
    'order-mixup', 'noodle-mishap', 'glitched-coop',
  ];
  if (storyKinds.includes(requestedStory as CafeStoryKind)) {
    const storyGuests = requestedStory === 'order-mixup' ? 6
      : requestedStory === 'arcade-rivals' || requestedStory === 'glitched-coop' ? 4
        : requestedStory === 'noodle-mishap' ? 2 : 4;
    options.initialGuests = Math.max(options.initialGuests ?? 0, storyGuests);
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
  private readonly venueButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-venue-choice]')];
  private readonly rendererStatus = requiredElement<HTMLElement>('[data-renderer-status]');
  private readonly retryButton = requiredElement<HTMLButtonElement>('[data-testid="renderer-retry"]');
  private readonly venueEyebrow = requiredElement<HTMLElement>('[data-venue-eyebrow]');
  private readonly venueDescription = requiredElement<HTMLElement>('[data-venue-description]');
  private readonly controls = requiredElement<HTMLElement>('[data-testid="controls"]');
  private readonly soundButton = requiredElement<HTMLButtonElement>('[data-testid="sound"]');
  private readonly fullscreenButton = requiredElement<HTMLButtonElement>('[data-testid="fullscreen"]');
  private readonly fullscreenLabel = requiredElement<HTMLElement>('[data-fullscreen-label]');
  private readonly status = requiredElement<HTMLElement>('#status');
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly simulation = new CafeSimulation(simulationOptions());
  private readonly camera = new CafeCamera();
  private readonly audio = new CafeAudio();
  private readonly environment = new CafeEnvironmentController({
    overrides: parseEnvironmentOverrides(window.location.search, import.meta.env.DEV),
    onNotice: (message) => { this.status.textContent = message; },
  });
  private readonly forcedQualityTier = parseRenderQualityOverride(window.location.search, import.meta.env.DEV);
  private readonly qualityGovernor = this.forcedQualityTier
    ? undefined
    : new RenderQualityGovernor('master');
  private qualityTier: RenderQualityTier = this.forcedQualityTier ?? 'master';
  private readonly frameBudget = new FrameBudgetProbe();
  private lifecycle?: RendererLifecycle;
  private rendererState: RendererState = 'loading';
  private rendererGeneration = 0;
  private environmentUnsubscribe?: () => void;
  private entered = false;
  private frame?: number;
  private preparationFrame?: number;
  private lastFrame = performance.now();
  private elapsed = 0;
  private idleTimer?: number;
  private lastAnnouncedAccidentId = 0;
  private lastAnnouncedMomentId = 0;
  private lastReactionAudioToken = 0;
  private selectedVenue: VenueKind = DEFAULT_VENUE;

  start(): void {
    this.setRendererState('loading');
    this.canvas.dataset.audioSamples = this.audio.getSampleState();
    this.canvas.dataset.performanceBudget = 'warming-up';
    this.updateMotionPreference();
    this.environmentUnsubscribe = this.environment.subscribe((snapshot) => this.applyEnvironment(snapshot));
    this.environment.start();
    this.selectVenue(this.selectedVenue);
    this.enterButton.addEventListener('click', this.enterCafe);
    this.retryButton.addEventListener('click', this.retryRenderer);
    for (const button of this.venueButtons) {
      button.addEventListener('click', this.venueSelected);
      button.addEventListener('keydown', this.venueKeyPressed);
    }
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
    this.canvas.addEventListener('pointermove', this.pointerMoved);
    this.canvas.addEventListener('pointerleave', this.pointerLeft);
    document.body.dataset.uiIdle = 'false';
    this.updateFullscreenState();
    this.scheduleRendererPreparation();
  }

  private readonly enterCafe = (): void => {
    if (this.entered || !this.lifecycle || this.rendererState !== 'ready') return;
    this.entered = true;
    this.lifecycle.start();
    this.welcome.classList.add('is-hidden');
    this.controls.hidden = false;
    document.body.dataset.entered = 'true';
    this.setUiIdle(false);
    this.scheduleIdle();
    this.status.textContent = VENUES[this.selectedVenue].statusMessage;
    this.canvas.dataset.renderLoop = document.hidden ? 'paused' : 'running';
    this.lastFrame = performance.now();
    this.startFrameLoop();
    void this.audio.start().then((state) => {
      this.soundButton.dataset.audioState = state;
      if (state === 'unavailable') {
        this.soundButton.disabled = true;
        this.soundButton.setAttribute('aria-label', 'Ton ist in diesem Browser nicht verfügbar');
      }
    });
  };

  private readonly venueSelected = (event: Event): void => {
    if (this.entered) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement) || !isVenueKind(target.dataset.venueChoice)) return;
    this.selectVenue(target.dataset.venueChoice);
  };

  private readonly venueKeyPressed = (event: KeyboardEvent): void => {
    if (this.entered) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = this.venueButtons.findIndex((button) => button === event.currentTarget);
    if (current < 0) return;
    const last = this.venueButtons.length - 1;
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current === last ? 0 : current + 1;
    else next = current === 0 ? last : current - 1;
    const button = this.venueButtons[next];
    if (!button || !isVenueKind(button.dataset.venueChoice)) return;
    this.selectVenue(button.dataset.venueChoice);
    button.focus();
  };

  private selectVenue(venue: VenueKind): void {
    this.selectedVenue = venue;
    const definition = VENUES[venue];
    this.venueEyebrow.textContent = definition.eyebrow;
    this.venueDescription.textContent = definition.description;
    this.enterButton.textContent = definition.enterLabel;
    this.canvas.setAttribute('aria-label', definition.canvasLabel);
    this.simulation.setVenue(venue);
    this.lifecycle?.setVenue(venue);
    this.audio.setVenue(venue);
    document.body.dataset.venue = venue;
    for (const button of this.venueButtons) {
      const selected = button.dataset.venueChoice === venue;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    this.renderStaticFrame();
  }

  private scheduleRendererPreparation(): void {
    const generation = ++this.rendererGeneration;
    this.setRendererState('loading');
    this.preparationFrame = requestAnimationFrame(() => {
      this.preparationFrame = undefined;
      const prepare = (): void => { void this.prepareRenderer(generation); };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(prepare, { timeout: 750 });
      } else {
        window.setTimeout(prepare, 0);
      }
    });
  }

  private async prepareRenderer(generation: number): Promise<void> {
    let candidate: RendererLifecycle | undefined;
    try {
      candidate = await loadRendererLifecycle({
        canvas: this.canvas,
        camera: this.camera,
        simulation: this.simulation,
        qualityTier: this.qualityTier,
      });
      if (generation !== this.rendererGeneration) {
        candidate.dispose();
        return;
      }
      candidate.setVenue(this.selectedVenue);
      candidate.setEnvironment(this.environment.getSnapshot());
      candidate.resize(this.motionQuery.matches);
      candidate.renderOnce(this.elapsed);
      this.lifecycle = candidate;
      this.canvas.dataset.renderLoop = 'single-frame';
      this.setRendererState('ready');
    } catch {
      candidate?.dispose();
      if (generation !== this.rendererGeneration) return;
      this.lifecycle = undefined;
      this.canvas.dataset.renderLoop = 'stopped';
      this.setRendererState('failed');
    }
  }

  private readonly retryRenderer = (): void => {
    if (this.rendererState !== 'failed') return;
    this.scheduleRendererPreparation();
  };

  private setRendererState(state: RendererState): void {
    this.rendererState = state;
    this.canvas.dataset.rendererState = state;
    this.canvas.dataset.qualityTier = this.qualityTier;
    this.canvas.dataset.masterResolution = '2304x1296';
    if (state === 'loading') {
      this.enterButton.disabled = true;
      this.enterButton.setAttribute('aria-busy', 'true');
      this.retryButton.hidden = true;
      this.rendererStatus.textContent = 'Das Diorama wird vorbereitet …';
      return;
    }
    this.enterButton.removeAttribute('aria-busy');
    if (state === 'ready') {
      this.enterButton.disabled = false;
      this.retryButton.hidden = true;
      this.rendererStatus.textContent = 'Das Diorama ist bereit.';
      return;
    }
    this.enterButton.disabled = true;
    this.retryButton.hidden = false;
    this.rendererStatus.textContent = 'Das Diorama konnte nicht geladen werden. Du kannst es noch einmal versuchen.';
  }

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

  private readonly pointerMoved = (event: PointerEvent): void => {
    if (!this.entered || event.pointerType !== 'mouse') return;
    this.lifecycle?.setPointerSample({ x: event.clientX, y: event.clientY });
  };

  private readonly pointerLeft = (): void => {
    this.lifecycle?.clearPointerSample();
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
    this.frame = undefined;
    if (!this.entered || document.hidden || !this.lifecycle) return;
    const frameDurationMs = Math.max(0, now - this.lastFrame);
    const delta = Math.min(0.1, frameDurationMs / 1000);
    this.lastFrame = now;
    this.applyEnvironment(this.environment.update(), false);
    this.elapsed += delta;
    const scene = this.lifecycle.update(delta);
    const accident = scene.accident;
    if (accident && accident.id !== this.lastAnnouncedAccidentId) {
      this.lastAnnouncedAccidentId = accident.id;
      this.status.textContent = ACCIDENT_MESSAGES[accident.kind];
      this.audio.playAccident(accident.kind);
    }
    const moment = scene.moment;
    if (moment && moment.id !== this.lastAnnouncedMomentId) {
      this.lastAnnouncedMomentId = moment.id;
      this.status.textContent = momentMessage(moment);
      this.audio.playMoment(moment.kind);
    }
    this.lifecycle.renderOnce(this.elapsed, scene);
    this.canvas.dataset.audioSamples = this.audio.getSampleState();
    const reactionToken = Number(this.canvas.dataset.reactionToken ?? 0);
    if (reactionToken > this.lastReactionAudioToken) {
      this.lastReactionAudioToken = reactionToken;
      if (this.audio.playReaction()) this.canvas.dataset.reactionAudioGain = String(REACTION_ACCENT_MAX_GAIN);
    }

    const reducedTier = this.qualityGovernor?.observeVisibleFrame(frameDurationMs);
    if (reducedTier) {
      this.qualityTier = reducedTier;
      this.lifecycle.setQualityTier(reducedTier);
      this.lifecycle.renderOnce(this.elapsed, scene);
    }
    const frameReport = this.frameBudget.observe(frameDurationMs, window.innerWidth < 700);
    if (frameReport) {
      this.canvas.dataset.frameMedian = frameReport.median.toFixed(2);
      this.canvas.dataset.frameP95 = frameReport.p95.toFixed(2);
      this.canvas.dataset.performanceBudget = frameReport.valid ? 'pass' : 'warning';
    }
    this.startFrameLoop();
  };

  private startFrameLoop(): void {
    if (this.frame !== undefined || !this.entered || document.hidden || !this.lifecycle) return;
    this.canvas.dataset.renderLoop = 'running';
    this.frame = requestAnimationFrame(this.tick);
  }

  private stopFrameLoop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private renderStaticFrame(): void {
    if (!this.lifecycle || this.rendererState !== 'ready' || this.entered || document.hidden) return;
    this.lifecycle.renderOnce(this.elapsed);
    this.canvas.dataset.renderLoop = 'single-frame';
  }

  private readonly resize = (): void => {
    if (!this.lifecycle || document.hidden) return;
    this.lifecycle.resize(this.motionQuery.matches);
    this.lifecycle.renderOnce(this.elapsed);
    if (!this.entered) this.canvas.dataset.renderLoop = 'single-frame';
  };

  private readonly updateMotionPreference = (): void => {
    document.body.dataset.reducedMotion = String(this.motionQuery.matches);
    if (!this.lifecycle || document.hidden) return;
    this.lifecycle.resize(this.motionQuery.matches);
    this.lifecycle.renderOnce(this.elapsed);
    if (!this.entered) this.canvas.dataset.renderLoop = 'single-frame';
  };

  private readonly visibilityChanged = (): void => {
    this.audio.fadeForVisibility(document.hidden);
    this.environment.visibilityChanged(document.hidden);
    this.lastFrame = performance.now();
    if (!this.entered || !this.lifecycle) return;
    if (document.hidden) {
      this.stopFrameLoop();
      this.lifecycle.stop();
      this.canvas.dataset.renderLoop = 'paused';
      return;
    }
    this.lifecycle.start();
    this.startFrameLoop();
  };

  private readonly destroy = (): void => {
    this.rendererGeneration += 1;
    this.stopFrameLoop();
    if (this.preparationFrame !== undefined) cancelAnimationFrame(this.preparationFrame);
    if (this.idleTimer !== undefined) window.clearTimeout(this.idleTimer);
    this.environmentUnsubscribe?.();
    this.environment.stop();
    this.canvas.removeEventListener('pointermove', this.pointerMoved);
    this.canvas.removeEventListener('pointerleave', this.pointerLeft);
    this.lifecycle?.dispose();
    void this.audio.destroy();
  };

  private applyEnvironment(snapshot: CafeEnvironmentSnapshot, renderWhenIdle = true): void {
    this.simulation.setEnvironment(snapshot);
    this.lifecycle?.setEnvironment(snapshot);
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
    if (renderWhenIdle) this.renderStaticFrame();
  }
}
