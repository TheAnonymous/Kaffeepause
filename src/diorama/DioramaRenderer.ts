import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { AtmosphereSnapshot } from '../atmosphere/types';
import {
  VENUE_LAYOUTS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  activitySpotById,
  type ActivitySpot,
} from '../simulation/layout';
import type { Barista, CafeMoment, CafeMomentKind, Guest } from '../simulation/types';
import { momentDefinition } from '../simulation/momentRegistry';
import type { SceneSnapshot } from '../scene/types';
import type { VenueKind } from '../venue';
import {
  RENDER_QUALITY_PROFILES,
  type RenderQualityProfile,
  type RenderQualityTier,
} from '../scene/renderQuality';
import type { ClickResult, RendererFrameMetrics } from '../scene/rendererLifecycle';
import { calculateDioramaLook, type DioramaLook } from './look';
import { calculateDialogue, type DialogueLine } from './dialogue';
import {
  SPEECH_BUBBLE_WORLD_HEIGHT,
  SPEECH_BUBBLE_WORLD_WIDTH,
  SpeechBubble,
  type SpeechBubblePlacement,
} from './speechBubble';
import { BARISTA_APPEARANCE, BARISTA_PALETTES, SEAT_TOP_HEIGHT, seatedHeadHeight } from './characters';
import { VoxelFigure } from './voxelFigure';
import {
  calculateBaristaVisualState,
  approachYawFor,
  calculateGuestVisualState,
  seatYawFor,
  type CharacterVisualState,
} from './characterVisualState';
import {
  PointerReactionController,
  REACTION_ACTIVATION_RADIUS,
  type ActivePointerReaction,
  type PointerSample,
  type ReactionTarget,
} from './pointerReaction';
import {
  CameraFocusDirector,
  calculateFocusFrameBounds,
  focusFieldOfView,
  participantMidpoint,
  type CameraFocusCandidate,
  type CameraFocusState,
  type FocusFrameElement,
} from './cameraFocus';
import { advanceMotion, followPoint, newMotionState, trackStepping, type MotionState } from './figureMotion';
import { avoidFaces, keepBubblesOnScreen, resolveBubblePlacements, type BubbleBounds, type FaceBox } from './bubbleLayout';
import {
  fadeFocusOccluder,
  restoreFocusOccluders,
  selectFocusOccluders,
  type FocusVisibilityTarget,
} from './focusOcclusion';
import {
  DIORAMA,
  FLOOR_SURFACE_Y,
  cameraPanForWorldX,
  worldToCharacterDiorama,
  worldToDiorama,
  type DioramaSet,
  type FocusOccluder,
} from './types';
import { buildVenue, doorShouldBeOpen, VENUE_WINDOWS } from './venueBuilder';
import { parseSeasonOverride, seasonForDate, type Season } from './season';
import { LuckyCat } from './luckyCat';
import { MomentProps, momentPropFixedPosition, momentPropSurface } from './momentProps';
import { CafeCat } from './cafeCat';
import {
  VENUE_VISUAL_PROFILES,
  focusBoundsAreSafe,
  type FocusFrameBounds,
} from './visualProfiles';
import {
  VenueArtPackLoader,
  type ArtAssetState,
  type LoadedVenueArtPack,
} from './artAssets';
import type { VenueArtDecoration } from './venueArtDecorator';
import {
  cinematicSequenceProfile,
  scaleCinematicProfile,
  type CameraTransform,
  type CinematicSequenceProfile,
  type CinematicShotBeat,
  type CinematicTransformSet,
} from './cinematicSequence';
import { FixedRenderPipeline } from './fixedRenderPipeline';
import { GpuFrameTimer } from './gpuTimer';
import { AtmosphereArtLoader, type AtmosphereArtPack } from './atmosphereAssets';
import { AtmosphereLayer, atmosphereLightCue } from './atmosphereLayer';

interface ScreenRect {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface CharacterNode {
  readonly root: Group;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly speech: SpeechBubble;
  figure?: VoxelFigure;
  figureKey: string;
  readonly motion: MotionState;
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 91.73 + salt * 17.17) * 43_758.5453;
  return value - Math.floor(value);
}

/**
 * Becher eines Gastes: Wer trinkt, leert ihn über die Zeit am Platz; anfangs dampft er noch.
 * Bei reduzierter Bewegung steigt kein Dampf auf.
 */
function cupFor(guest: Guest, reducedMotion: boolean): { cupFill: number; steaming: boolean } {
  if (guest.state !== 'activity' || guest.activity !== 'drinking' || guest.stateDuration <= 0) return { cupFill: 1, steaming: false };
  const progress = Math.max(0, Math.min(1, guest.stateTime / guest.stateDuration));
  return { cupFill: 1 - progress * 0.85, steaming: !reducedMotion && progress < 0.4 };
}

/** Um Halloween trägt etwa jeder dritte Gast einen Hexenhut. */
function halloweenHat(season: Season, guestId: string): 'witch' | undefined {
  const number = Number.parseInt(guestId.replace(/\D/g, ''), 10) || 0;
  return season === 'halloween' && number % 3 === 1 ? 'witch' : undefined;
}

/** Oberkanten, auf die Gegenstände von Momenten gelegt werden (siehe `venueBuilder.ts`). */
const TABLE_TOP_Y = 0.98;
const RAMEN_COUNTER_TOP_Y = 1.33;
/** Auf Höhe der Schüsselreihe, nah an der Vorderkante der Ramen-Theke. */
const RAMEN_COUNTER_PROP_Z = -1.68;
const MOMENT_PROP_SCALE = 1.7;
const CAFE_BENCH_TOP_Y = 0.67;
const CAFE_BENCH_Z = -1.74;
const LOUNGE_SEAT_TOP_Y = 0.43;
const LOUNGE_SEAT_Z = 2.2;

/** Seitenverhältnis, für das der Raum gebaut ist (16:9). */
const DESIGN_ASPECT = WORLD_WIDTH / WORLD_HEIGHT;
/** Schmaler als das zeigt die Kamera nur einen Ausschnitt und fährt durch den Raum (Handys, Tablets hochkant). */
const TOUR_ASPECT = 1.5;
const MINIMUM_SCENE_WIDTH = 96;
/** Breiter als das zeigt das Bild links und rechts etwas mehr als den Raum, statt noch weiter heranzurücken. */
const WIDEST_FITTED_ASPECT = 2.4;

/** Kopfhöhe einer Figur an ihrem Platz; ohne Platz steht sie. */
function characterTop(spot: ActivitySpot | undefined): number {
  return spot?.pose === 'seated' ? seatedHeadHeight(spot.kind) : DIORAMA.standingHeight;
}

const DIORAMA_VOID = new Color('#120e16');
/** Trefferradius für kleine Ziele wie Mochi und die Klingel (CSS-Pixel). */
const CLICK_RADIUS_SMALL = 48;
const BELL_CLICK_OFFSET = new Vector3(0, 0.1, 0);
// Regen fällt draußen: hinter der Rückwand (−3,41 bis −3,63) und vor der Stadtkulisse
// (−3,66), nur so breit wie das Fenster des Ortes. Wo die Wand geschlossen ist, verdeckt sie ihn.
const SKY_BACKDROP_LIFT = new Color('#ffffff');
/** Farbe von Nebel und Schnee draußen: ein helles, leicht kühles Grau. */
const EXTERIOR_HAZE = new Color('#b9c4cc');
const RAIN_Z = -3.635;

const INITIAL_CAMERA_TRANSFORM: CameraTransform = Object.freeze({
  position: Object.freeze({ x: 0, y: 6.7, z: 15.8 }),
  target: Object.freeze({ x: 0, y: 2.55, z: -0.2 }),
  fieldOfView: 30,
});

export class DioramaRenderer {
  private readonly webgl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(30, 16 / 9, 0.1, 80);
  private readonly pipeline: FixedRenderPipeline;
  private readonly gpuTimer: GpuFrameTimer;
  private readonly hemisphere = new HemisphereLight('#bad7df', '#2a2028', 1.1);
  private readonly keyLight = new DirectionalLight('#fff0cc', 3.1);
  private readonly focusLight = new PointLight('#ffe0a6', 0, 5.2, 1.55);
  private readonly guestNodes = new Map<string, CharacterNode>();
  private readonly baristaNode: CharacterNode;
  private readonly weatherLayers: readonly Points<BufferGeometry, PointsMaterial>[];
  private readonly atmosphereLayer = new AtmosphereLayer();
  private readonly atmosphereTint = new Color();
  private readonly eventAccent: Mesh<RingGeometry, MeshBasicMaterial>;
  private venueSet: DioramaSet;
  private venue: VenueKind = 'cafe';
  private environment?: CafeEnvironmentSnapshot;
  private look: DioramaLook;
  private active = false;
  private reducedMotion = false;
  private readonly exteriorHaze = new Color();
  private sceneWidth = WORLD_WIDTH;
  /** Breite zu Höhe des gezeichneten Bilds; entspricht dem Fenster. */
  private viewAspect = WORLD_WIDTH / WORLD_HEIGHT;
  private doorOpen = 0;
  private activeSpeechBubbles = 0;
  private pointerSample?: PointerSample;
  private readonly pointerReactions = new PointerReactionController();
  private activeReaction?: ActivePointerReaction;
  private reactionTargets: readonly ReactionTarget[] = [];
  private readonly focusDirector = new CameraFocusDirector();
  private focusState: CameraFocusState = {
    active: false, phase: 'overview', participantIds: [], amount: 0, fieldOfView: 30,
    shotBeat: 'overview', sequenceId: 'none', sequenceProgress: 0,
    position: INITIAL_CAMERA_TRANSFORM.position, lookAt: INITIAL_CAMERA_TRANSFORM.target,
  };
  private focusFrameBounds?: FocusFrameBounds;
  private focusFrameSafe = true;
  private focusFovLift = 0;
  private focusPanX = 0;
  private focusPanY = 0;
  private focusFramingKey?: string;
  private activeFocusOccluders: readonly FocusOccluder[] = [];
  private visibleDialogue: readonly DialogueLine[] = [];
  private qualityTier: RenderQualityTier;
  private qualityProfile: RenderQualityProfile;
  private renderCount = 0;
  private visualRenderCount = 0;
  private readonly artLoader: VenueArtPackLoader;
  private artPack?: LoadedVenueArtPack;
  private artDecoration?: VenueArtDecoration;
  private readonly atmosphereDecorHandoffs: Object3D[] = [];
  private windowArt?: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private figureTime = 0;
  private figureDelta = 0;
  private readonly rimColor = new Color();
  private bellRungAt = Number.NEGATIVE_INFINITY;
  private readonly season: Season;
  private cat?: CafeCat;
  private luckyCat?: LuckyCat;
  private readonly momentProps = new MomentProps();
  private momentProp?: { readonly kind: CafeMomentKind; readonly group: Group };
  private catPetted = false;
  private catPurrToken = 0;
  private artGeneration = 0;
  private readonly atmosphereLoader: AtmosphereArtLoader;
  private atmospherePack?: AtmosphereArtPack;
  private atmosphereGeneration = 0;
  private atmosphere: AtmosphereSnapshot = {
    wave: 'none', phase: 'idle', zone: 'none', intensity: 0, seed: 0,
    venue: 'cafe', durationSeconds: 0, elapsedSeconds: 0, reducedMotion: false,
    motion: 'animated', venueSignature: false,
  };
  private readonly cinematicScale: number;
  private readonly cinematicShotOverride?: Extract<CinematicShotBeat, 'establishing' | 'detail' | 'reaction'>;
  private readonly diagnosticRendering: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CafeCamera,
    qualityTier: RenderQualityTier = 'master',
  ) {
    const parameters = new URLSearchParams(window.location.search);
    const forceArtFallback = import.meta.env.DEV && parameters.get('art') === 'fallback';
    this.diagnosticRendering = import.meta.env.DEV && parameters.get('testRender') === 'diagnostic';
    this.season = parseSeasonOverride(window.location.search, import.meta.env.DEV) ?? seasonForDate(new Date());
    this.cinematicScale = import.meta.env.DEV
      ? Math.max(0.02, Math.min(1, Number(parameters.get('cinematicScale') ?? 1) || 1))
      : 1;
    const requestedShot = parameters.get('cinematicShot');
    this.cinematicShotOverride = import.meta.env.DEV
      && (requestedShot === 'establishing' || requestedShot === 'detail' || requestedShot === 'reaction')
      ? requestedShot
      : undefined;
    this.artLoader = forceArtFallback
      ? new VenueArtPackLoader(async () => { throw new Error('forced-art-fallback'); })
      : new VenueArtPackLoader();
    const forceAtmosphereFallback = import.meta.env.DEV && parameters.get('atmosphereAssets') === 'fallback';
    this.atmosphereLoader = forceAtmosphereFallback
      ? new AtmosphereArtLoader(async () => { throw new Error('forced-atmosphere-fallback'); })
      : new AtmosphereArtLoader();
    this.qualityTier = qualityTier;
    this.qualityProfile = RENDER_QUALITY_PROFILES[qualityTier];
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(1);
    if (this.diagnosticRendering) this.webgl.info.autoReset = false;
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFShadowMap;
    this.webgl.shadowMap.autoUpdate = false;
    this.webgl.setClearColor('#181520');

    this.look = calculateDioramaLook(this.venue);
    // Um das Diorama herum ist es dunkel; das Fenster hat eine eigene Stadtkulisse.
    this.scene.background = DIORAMA_VOID;
    this.scene.fog = new FogExp2(this.look.sky, 0.018);
    this.scene.add(this.hemisphere, this.keyLight, this.focusLight);
    this.keyLight.position.set(7, 11, 8);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -10;
    this.keyLight.shadow.camera.right = 10;
    this.keyLight.shadow.camera.top = 10;
    this.keyLight.shadow.camera.bottom = -3;
    this.keyLight.shadow.bias = -0.0007;
    this.scene.add(this.keyLight.target);

    this.venueSet = buildVenue(this.venue, this.season);
    this.scene.add(this.venueSet.root);
    this.updateCatPresence();
    this.scene.add(this.atmosphereLayer.root);
    this.baristaNode = this.createCharacterNode('barista');
    this.scene.add(this.baristaNode.root);
    this.weatherLayers = [
      this.createWeatherParticles(),
    ];
    this.scene.add(...this.weatherLayers);
    this.eventAccent = this.createEventAccent();
    this.scene.add(this.eventAccent);

    this.perspective.position.set(0, 6.7, 15.8);
    this.perspective.lookAt(0, 2.55, -0.2);
    this.pipeline = new FixedRenderPipeline(this.webgl, this.qualityProfile);
    this.gpuTimer = new GpuFrameTimer(this.webgl.getContext());
    this.applyQualityProfile();

    canvas.dataset.renderCount = '0';
    canvas.dataset.visualRenderCount = '0';
    canvas.dataset.reactingCharacter = 'none';
    canvas.dataset.cameraFocus = 'none';
    canvas.dataset.cameraFocusSource = 'none';
    canvas.dataset.emoteBubbles = '0';
    canvas.dataset.artAssets = 'loading';
    canvas.dataset.artPack = 'procedural';
    canvas.dataset.atmosphereAssets = 'loading';
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestored);
    this.requestVenueArt(this.venue);
    this.requestAtmosphereArt(this.venue);
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setPointerSample(sample: PointerSample): void {
    const hit = [...this.reactionTargets]
      .sort((left, right) => (
        Math.hypot(sample.x - left.x, sample.y - left.y) - Math.hypot(sample.x - right.x, sample.y - right.y)
      ))[0];
    const targetId = hit && Math.hypot(sample.x - hit.x, sample.y - hit.y) <= REACTION_ACTIVATION_RADIUS
      ? hit.id
      : undefined;
    this.pointerSample = { ...sample, targetId };
  }

  clearPointerSample(): void {
    this.pointerSample = undefined;
    this.pointerReactions.clearPointer();
  }

  /** Nächstes anklickbares Ding an einer Bildschirmstelle: Mochi, Klingel oder eine Figur. */
  private pickAt(clientX: number, clientY: number): (ClickResult & { readonly target?: ReactionTarget }) | undefined {
    if (!this.active) return undefined;
    const bounds = this.canvas.getBoundingClientRect();
    const screen = (point: Vector3): { x: number; y: number } => {
      const projected = point.clone().project(this.perspective);
      return { x: bounds.left + (projected.x + 1) * bounds.width / 2, y: bounds.top + (1 - projected.y) * bounds.height / 2 };
    };
    const candidates: { result: ClickResult & { target?: ReactionTarget }; distance: number }[] = [];
    if (this.cat) {
      const point = screen(this.cat.focusPoint);
      candidates.push({ result: { kind: 'cat' }, distance: Math.hypot(clientX - point.x, clientY - point.y) - CLICK_RADIUS_SMALL });
    }
    if (this.luckyCat) {
      const point = screen(this.luckyCat.focusPoint);
      candidates.push({ result: { kind: 'lucky-cat' }, distance: Math.hypot(clientX - point.x, clientY - point.y) - CLICK_RADIUS_SMALL });
    }
    const bell = screen(this.venueSet.bell.getWorldPosition(new Vector3()).add(BELL_CLICK_OFFSET));
    candidates.push({ result: { kind: 'bell' }, distance: Math.hypot(clientX - bell.x, clientY - bell.y) - CLICK_RADIUS_SMALL });
    for (const target of this.reactionTargets) {
      candidates.push({
        result: { kind: target.id === 'barista' ? 'barista' : 'guest', id: target.id, target },
        distance: Math.hypot(clientX - target.x, clientY - target.y) - REACTION_ACTIVATION_RADIUS,
      });
    }
    // Kleine Ziele (Mochi, Winkekatze, Klingel) gewinnen, wenn man sie direkt trifft; Figuren haben einen größeren Radius.
    const small = (result: ClickResult): boolean => result.kind === 'cat' || result.kind === 'lucky-cat' || result.kind === 'bell';
    const best = candidates
      .filter((entry) => entry.distance <= 0)
      .sort((left, right) => Number(small(right.result)) - Number(small(left.result)) || left.distance - right.distance)[0];
    return best?.result;
  }

  interactiveAt(clientX: number, clientY: number): boolean {
    return this.pickAt(clientX, clientY) !== undefined;
  }

  handleClick(clientX: number, clientY: number): ClickResult | undefined {
    const hit = this.pickAt(clientX, clientY);
    if (!hit) return undefined;
    if (hit.kind === 'cat') {
      if (!this.cat?.summon(this.figureTime, this.reducedMotion)) return undefined;
    } else if (hit.kind === 'lucky-cat') {
      if (!this.luckyCat?.wave(this.figureTime)) return undefined;
    } else if (hit.kind === 'bell') {
      this.bellRungAt = this.figureTime;
    } else if (hit.target) {
      const reaction = this.pointerReactions.trigger(this.figureTime, hit.target, this.venue, clientX);
      if (!reaction) return undefined;
      this.activeReaction = reaction;
      this.canvas.dataset.reactionToken = String(reaction.serial);
    }
    return { kind: hit.kind, ...(hit.id ? { id: hit.id } : {}) };
  }

  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.artGeneration += 1;
    this.artLoader.cancel();
    this.releaseVenueArt();
    this.atmosphereGeneration += 1;
    this.atmosphereLoader.cancel();
    this.releaseAtmosphereArt();
    this.gpuTimer.reset();
    this.setArtState('failed', 'procedural-context-fallback');
  };

  private readonly contextRestored = (): void => {
    this.gpuTimer.reset();
    this.requestVenueArt(this.venue);
    this.requestAtmosphereArt(this.venue);
  };

  private setArtState(state: ArtAssetState, pack = 'procedural'): void {
    this.canvas.dataset.artAssets = state;
    this.canvas.dataset.artPack = pack;
  }

  private requestVenueArt(venue: VenueKind): void {
    const generation = ++this.artGeneration;
    this.setArtState('loading', 'procedural-loading');
    void this.artLoader.load(venue).then(async (pack) => {
      if (generation !== this.artGeneration || venue !== this.venue) {
        pack?.dispose();
        return;
      }
      if (!pack) {
        this.setArtState('failed', 'procedural-fallback');
        return;
      }
      try {
        const { decorateVenueWithArtPack } = await import('./venueArtDecorator');
        if (generation !== this.artGeneration || venue !== this.venue) {
          pack.dispose();
          return;
        }
        this.artDecoration = decorateVenueWithArtPack(this.venueSet, pack);
        const windowArt = this.artDecoration.root.getObjectByName('authored-art-detail:surface-glass');
        this.windowArt = windowArt instanceof Mesh && windowArt.material instanceof MeshBasicMaterial
          ? windowArt as Mesh<PlaneGeometry, MeshBasicMaterial>
          : undefined;
        this.atmosphereDecorHandoffs.length = 0;
        if (venue === 'ramen') {
          for (const name of ['art-detail:prop-primary', 'art-instanced-props:ramen']) {
            const object = this.artDecoration.root.getObjectByName(name);
            if (object) this.atmosphereDecorHandoffs.push(object);
          }
        }
        this.artPack = pack;
        this.setArtState('ready', pack.id);
      } catch {
        this.artDecoration?.dispose();
        this.artDecoration = undefined;
        pack.dispose();
        this.setArtState('failed', 'procedural-apply-fallback');
      }
    });
  }

  private releaseVenueArt(): void {
    this.artDecoration?.dispose();
    this.artDecoration = undefined;
    this.windowArt = undefined;
    this.atmosphereDecorHandoffs.length = 0;
    this.artPack?.dispose();
    this.artPack = undefined;
    this.setArtState('procedural');
  }

  private requestAtmosphereArt(venue: VenueKind): void {
    const generation = ++this.atmosphereGeneration;
    this.canvas.dataset.atmosphereAssets = 'loading';
    void this.atmosphereLoader.load(venue).then((pack) => {
      if (generation !== this.atmosphereGeneration || venue !== this.venue) {
        pack?.dispose();
        return;
      }
      if (!pack) {
        this.atmosphereLayer.setAssets(undefined);
        this.canvas.dataset.atmosphereAssets = 'failed';
        return;
      }
      this.atmospherePack?.dispose();
      this.atmospherePack = pack;
      this.atmosphereLayer.setAssets(pack);
      this.canvas.dataset.atmosphereAssets = pack.state;
    });
  }

  private releaseAtmosphereArt(): void {
    this.atmosphereLayer.setAssets(undefined);
    this.atmospherePack?.dispose();
    this.atmospherePack = undefined;
    this.canvas.dataset.atmosphereAssets = 'procedural';
  }

  setQualityTier(tier: RenderQualityTier): void {
    if (tier === this.qualityTier) return;
    this.qualityTier = tier;
    this.qualityProfile = RENDER_QUALITY_PROFILES[tier];
    this.applyQualityProfile();
    this.resize(this.reducedMotion);
  }

  setVenue(venue: VenueKind): void {
    if (venue !== this.venue) {
      this.restoreFocusEffects();
      this.releaseVenueArt();
      this.artLoader.cancel();
      this.atmosphereGeneration += 1;
      this.atmosphereLoader.cancel();
      this.releaseAtmosphereArt();
      this.venueSet.dispose();
      this.venue = venue;
      this.venueSet = buildVenue(venue, this.season);
      this.scene.add(this.venueSet.root);
      this.updateCatPresence();
      this.layoutWeatherForVenue();
      this.atmosphereLayer.setVenue(venue);
      this.requestVenueArt(venue);
      this.requestAtmosphereArt(venue);
    }
    this.look = calculateDioramaLook(this.venue, this.environment);
    this.canvas.dataset.venue = venue;
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.environment = snapshot;
    this.look = calculateDioramaLook(this.venue, snapshot);
    this.canvas.dataset.weather = snapshot.weather.kind;
    this.canvas.dataset.weatherSource = snapshot.weatherSource;
    this.canvas.dataset.locationState = snapshot.locationState;
  }

  setAtmosphere(snapshot: AtmosphereSnapshot): void {
    this.atmosphere = snapshot;
  }

  resize(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    // Das Bild hat immer das Seitenverhältnis des Fensters, sonst wäre es verzerrt.
    // Sehr schmale Fenster zeigen nur einen Ausschnitt, durch den die Kamera fährt;
    // alle anderen zeigen die ganze Breite des Raums (siehe `fitFieldOfView`).
    const touring = aspect < TOUR_ASPECT;
    this.sceneWidth = touring ? Math.max(MINIMUM_SCENE_WIDTH, Math.round(WORLD_HEIGHT * aspect)) : WORLD_WIDTH;
    this.viewAspect = touring ? this.sceneWidth / WORLD_HEIGHT : aspect;
    const height = WORLD_HEIGHT * this.qualityProfile.renderScale;
    const width = Math.round(height * this.viewAspect);
    this.webgl.setSize(width, height, false);
    this.pipeline.resize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.camera.configure(this.sceneWidth, touring, reducedMotion);
    this.canvas.dataset.cameraMode = this.camera.mode;
  }

  /**
   * Hält die Breite des Raums im Bild, egal wie breit das Fenster ist: schmalere Fenster zeigen mehr
   * Höhe, breitere rücken etwas näher heran. Im Ausschnitt-Modus bleibt der Blickwinkel, wie er ist.
   */
  private fitFieldOfView(verticalFov: number): number {
    if (this.sceneWidth < WORLD_WIDTH) return verticalFov;
    const fitted = Math.min(WIDEST_FITTED_ASPECT, this.viewAspect);
    const scale = Math.tan(verticalFov * Math.PI / 360) * DESIGN_ASPECT / fitted;
    return Math.atan(scale) * 360 / Math.PI;
  }

  render(elapsed: number, snapshot: SceneSnapshot): RendererFrameMetrics {
    return this.renderFrame(elapsed, snapshot, !this.diagnosticRendering);
  }

  renderVisual(elapsed: number, snapshot: SceneSnapshot): RendererFrameMetrics {
    return this.renderFrame(elapsed, snapshot, true);
  }

  private renderFrame(elapsed: number, snapshot: SceneSnapshot, drawVisualFrame: boolean): RendererFrameMetrics {
    const cpuStart = performance.now();
    let gpuMs = this.gpuTimer.poll();
    const time = this.active ? elapsed : 0;
    this.applyLook(time);
    this.updatePointerReaction(snapshot, time);
    const dialogue = this.active ? calculateDialogue(snapshot, time, this.venue, this.reducedMotion, this.activeReaction) : [];
    this.updateFocus(snapshot, time, dialogue);
    this.updateCamera();
    this.updateVenue(time);
    this.updateDoor(snapshot.guests, snapshot.venue);
    this.figureDelta = Math.max(0, Math.min(0.5, time - this.figureTime));
    this.figureTime = time;
    this.updateCharacters(snapshot, time, dialogue);
    this.updateArcadeScreens(snapshot, time);
    this.updateSeatSteam(snapshot);
    this.updateCat(time);
    this.updateBell(time);
    this.updateFocusEffects(snapshot);
    this.updateFigureGlow(time);
    this.updateFocusFrame(snapshot);
    this.updateWeather(time);
    this.atmosphereLayer.update(this.atmosphere, this.qualityTier, time);
    for (const object of this.atmosphereDecorHandoffs) object.visible = this.atmosphere.intensity <= 0.004;
    this.updateEvent(snapshot, time);
    this.updateMomentProp(snapshot);
    if (drawVisualFrame) {
      if (this.diagnosticRendering) this.webgl.info.reset();
      this.gpuTimer.begin();
      this.pipeline.render(this.scene, this.perspective);
      this.gpuTimer.end();
      if (this.diagnosticRendering) {
        // Nur im Testmodus: Zeichenaufrufe über alle Durchgänge eines Bildes (Schatten, Bloom, Bild).
        this.canvas.dataset.drawCalls = String(this.webgl.info.render.calls);
        this.canvas.dataset.triangles = String(this.webgl.info.render.triangles);
        this.canvas.dataset.bubbleLayout = JSON.stringify(this.measureBubbleLayout());
      }
      gpuMs ??= this.gpuTimer.poll();
      this.visualRenderCount += 1;
      this.canvas.dataset.visualRenderCount = String(this.visualRenderCount);
    }
    this.renderCount += 1;
    this.canvas.dataset.renderCount = String(this.renderCount);
    this.updateDatasets(snapshot);
    return {
      cpuMs: Math.max(0, performance.now() - cpuStart),
      ...(gpuMs === undefined ? {} : { gpuMs }),
    };
  }

  dispose(): void {
    this.restoreFocusEffects();
    this.artGeneration += 1;
    this.artLoader.cancel();
    this.releaseVenueArt();
    this.atmosphereGeneration += 1;
    this.atmosphereLoader.cancel();
    this.releaseAtmosphereArt();
    this.atmosphereLayer.dispose();
    this.cat?.dispose();
    this.luckyCat?.dispose();
    this.momentProps.dispose();
    this.venueSet.dispose();
    for (const node of this.guestNodes.values()) this.disposeCharacterNode(node);
    this.disposeCharacterNode(this.baristaNode);
    for (const layer of this.weatherLayers) {
      layer.geometry.dispose();
      layer.material.dispose();
    }
    this.eventAccent.geometry.dispose();
    this.eventAccent.material.dispose();
    this.pipeline.dispose();
    this.gpuTimer.dispose();
    this.webgl.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
  }

  private applyLook(time: number): void {
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(this.look.sky);
      // Nebel liegt draußen vor dem Fenster, nicht im Raum: Der Raum bekommt nur einen leichten Schleier.
      this.scene.fog.density = 0.006 + this.look.fog * 0.012;
    }
    this.webgl.toneMappingExposure = this.look.exposure;
    this.hemisphere.color.copy(this.look.fillColor).lerp(this.look.ambient, 0.28);
    this.hemisphere.groundColor.copy(this.look.shadowColor);
    this.hemisphere.intensity = this.look.ambientIntensity;
    this.keyLight.color.copy(this.look.keyColor).lerp(this.look.sun, 0.26);
    this.keyLight.intensity = this.look.keyIntensity;
    this.keyLight.position.x = this.look.fromRight ? 8 : -8;
    for (const light of this.venueSet.practicalLights) {
      light.intensity = this.look.practicalIntensity;
      const baseColor = new Color(light.userData.baseColor ?? this.look.practicalColor);
      light.color.copy(baseColor).lerp(this.look.practicalColor, 0.32);
    }
    for (const pool of this.venueSet.lightPools) pool.material.opacity = this.look.lightPoolOpacity;
    this.venueSet.floorMaterial.roughness = 0.55 - this.look.wetness * 0.2;
    this.venueSet.floorMaterial.metalness = 0.08 + this.look.wetness * 0.14;
    // Nebel und Schnee machen die Welt draußen hell und weich: tags milchig, nachts matt.
    const haze = Math.min(1, this.look.fog * 0.85 + this.look.snow * 0.45);
    this.exteriorHaze.copy(EXTERIOR_HAZE).multiplyScalar(0.22 + this.look.daylight * 0.78);
    for (const [index, material] of this.venueSet.exteriorMaterials.entries()) {
      if (index === 0) {
        // Der Himmel hinter den Fenstern folgt Tageszeit und Wetter. Er leuchtet selbst
        // und nimmt kaum Raumlicht an, sonst hellen ihn nachts die Lampen durch die Wand auf.
        material.emissive.copy(this.look.sky).lerp(SKY_BACKDROP_LIFT, 0.06).lerp(this.exteriorHaze, haze);
        material.color.copy(material.emissive).multiplyScalar(0.18);
        material.emissiveIntensity = 0.12 + this.look.daylight * 0.68;
        continue;
      }
      // Häuser draußen leuchten selbst: tags hell, nachts dunkle Silhouetten mit erleuchteten Fenstern.
      const base = material.userData.exteriorBase instanceof Color
        ? material.userData.exteriorBase as Color
        : (material.userData.exteriorBase = material.color.clone()) as Color;
      material.color.copy(base).multiplyScalar(0.12);
      material.emissive.copy(base).lerp(this.exteriorHaze, haze * 0.9);
      material.emissiveIntensity = 0.28 + this.look.daylight * 0.62;
    }
    if (this.venueSet.rainGlass) this.venueSet.rainGlass.opacity = 0.02 + this.look.rain * 0.08;
    if (this.windowArt) {
      // Das gemalte Bild zeigt eine verregnete Abendstadt mit Tropfen auf der Scheibe. Es erscheint nur bei Regen
      // und Gewitter, tagsüber schwächer; sonst sieht man durchs Fenster Himmel und Häuser aus Klötzchen.
      this.windowArt.material.opacity = (0.18 + this.look.night * 0.64) * (1 - this.look.fog * 0.7) * this.look.rain;
      this.windowArt.visible = this.windowArt.material.opacity > 0.01;
    }
    const atmosphereCue = atmosphereLightCue(this.atmosphere, time);
    this.atmosphereTint.set(atmosphereCue.tint);
    this.keyLight.color.lerp(this.atmosphereTint, Math.min(0.72, atmosphereCue.key * 0.34 + atmosphereCue.flash * 0.35));
    this.keyLight.intensity += atmosphereCue.key;
    this.hemisphere.intensity += atmosphereCue.ambient;
    for (const light of this.venueSet.practicalLights) light.intensity += atmosphereCue.practical;
    for (const material of this.venueSet.exteriorMaterials) material.emissiveIntensity += atmosphereCue.exterior;
    this.pipeline.setLook({
      bloomStrength: this.look.bloom * this.qualityProfile.bloomStrength,
      bloomThreshold: VENUE_VISUAL_PROFILES[this.venue].bloom.threshold,
      focusBand: this.look.focusBand,
      blurStrength: this.look.blur * this.qualityProfile.miniatureBlurStrength,
      vignette: this.look.vignette,
      warmth: this.venue === 'arcade' ? -0.08 : 0.12 + this.look.night * 0.08,
      saturation: this.look.saturation,
      shadowLift: this.look.shadowLift,
      time,
    });
  }

  private applyQualityProfile(): void {
    const profile = this.qualityProfile;
    this.pipeline.applyProfile(profile);
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  }

  private updatePointerReaction(snapshot: SceneSnapshot, time: number): void {
    this.reactionTargets = [
      ...snapshot.guests.map((guest) => this.projectReactionTarget(guest.id, guest.position)),
      this.projectReactionTarget('barista', snapshot.barista.position),
    ];
    const pointer = this.active ? this.pointerSample : undefined;
    const update = this.pointerReactions.update(time, pointer, this.reactionTargets, this.venue);
    this.activeReaction = update.active;
    if (update.started) this.canvas.dataset.reactionToken = String(update.started.serial);
  }

  private projectReactionTarget(id: string | 'barista', position: Guest['position']): ReactionTarget {
    const point = worldToCharacterDiorama(position);
    const projected = new Vector3(point.x, id === 'barista' ? 1.55 : 1.35, point.z).project(this.perspective);
    const bounds = this.canvas.getBoundingClientRect();
    return {
      id,
      x: bounds.left + (projected.x + 1) * bounds.width / 2,
      y: bounds.top + (1 - projected.y) * bounds.height / 2,
    };
  }

  private updateFocus(snapshot: SceneSnapshot, time: number, dialogue: readonly DialogueLine[]): void {
    const candidates: CameraFocusCandidate[] = [];
    const moment = snapshot.moment;
    if (moment?.story) {
      const candidate = this.createFocusCandidate('story', String(moment.id), moment.participantIds, undefined, snapshot);
      if (candidate) candidates.push(candidate);
    }
    if (snapshot.accident) {
      const explicitIds = [
        ...(snapshot.accident.kind === 'tray-drop' ? ['barista'] : []),
        snapshot.accident.guestId,
        snapshot.accident.witnessId,
      ].filter((id): id is string => id !== undefined);
      const participantIds = explicitIds.length > 0
        ? explicitIds
        : this.nearestGuestIds(snapshot, snapshot.accident.position, 1);
      const candidate = this.createFocusCandidate(
        'accident',
        String(snapshot.accident.id),
        participantIds,
        snapshot.accident.position,
        snapshot,
      );
      if (candidate) candidates.push(candidate);
    }
    if (this.activeReaction) {
      const candidate = this.createFocusCandidate(
        'reaction',
        String(this.activeReaction.serial),
        [this.activeReaction.characterId],
        undefined,
        snapshot,
      );
      if (candidate) candidates.push(candidate);
    }
    if (moment && !moment.story) {
      const candidate = this.createFocusCandidate('moment', String(moment.id), moment.participantIds, undefined, snapshot);
      if (candidate) candidates.push(candidate);
    }
    const conversation = dialogue.find((line) => line.kind === 'conversation');
    const conversationGuest = snapshot.guests.find((guest) => guest.id === conversation?.speakerId);
    if (conversationGuest) {
      const partner = snapshot.guests
        .filter((guest) => guest.id !== conversationGuest.id && guest.state === 'activity'
          && (guest.activity === 'talking' || guest.activity === 'phone'))
        .sort((left, right) => (
          Math.hypot(left.position.x - conversationGuest.position.x, left.position.y - conversationGuest.position.y)
          - Math.hypot(right.position.x - conversationGuest.position.x, right.position.y - conversationGuest.position.y)
        ))[0];
      const candidate = this.createFocusCandidate(
        'conversation',
        `${conversationGuest.id}:${Math.floor(time / 4.6)}`,
        [conversationGuest.id, ...(partner ? [partner.id] : [])],
        undefined,
        snapshot,
      );
      if (candidate) candidates.push(candidate);
    }
    this.focusState = this.focusDirector.update(
      time,
      this.active ? candidates : [],
      this.reducedMotion,
      this.overviewCameraTransform(),
      this.cinematicShotOverride,
    );
    this.camera.setFocusPaused(this.focusState.active);
  }

  private createFocusCandidate(
    source: CameraFocusCandidate['source'],
    key: string,
    requestedParticipantIds: readonly string[],
    fallbackTarget: Guest['position'] | undefined,
    snapshot: SceneSnapshot,
  ): CameraFocusCandidate | undefined {
    const participantIds = [...new Set(requestedParticipantIds)].filter((id) => this.positionForParticipant(id, snapshot));
    const positions = participantIds
      .map((id) => this.positionForParticipant(id, snapshot))
      .filter((position): position is Guest['position'] => position !== undefined);
    const target = participantMidpoint(positions) ?? fallbackTarget;
    if (!target) return undefined;
    const targetHeights = participantIds.map((id) => {
      if (id === 'barista') return DIORAMA.standingHeight + 0.25;
      const guest = snapshot.guests.find((entry) => entry.id === id);
      const spot = activitySpotById(VENUE_LAYOUTS[snapshot.venue], guest?.activitySpotId);
      if (guest?.state !== 'activity') return DIORAMA.standingHeight + 0.25;
      return characterTop(spot) + (spot?.pose === 'standing' ? 0.1 : 0.48);
    });
    const targetHeight = targetHeights.length > 0
      ? targetHeights.reduce((sum, height) => sum + height, 0) / targetHeights.length
      : DIORAMA.standingHeight + 0.25;
    const sequenceProfile = this.profileForFocus(source, snapshot);
    return {
      source,
      key,
      target: { ...target },
      participantIds,
      targetHeight,
      fieldOfView: focusFieldOfView(positions.length > 0 ? positions : [target]),
      sequenceProfile,
      transforms: this.cinematicTransforms(target, targetHeight, sequenceProfile),
    };
  }

  private profileForFocus(source: CameraFocusCandidate['source'], snapshot: SceneSnapshot): CinematicSequenceProfile {
    const profile = source === 'moment' && snapshot.moment
      ? cinematicSequenceProfile(momentDefinition(snapshot.moment.kind)?.camera ?? 'conversation')
      : source === 'story'
        ? cinematicSequenceProfile('story')
        : source === 'accident'
          ? cinematicSequenceProfile('accident')
          : source === 'reaction'
            ? cinematicSequenceProfile('pointer-reaction')
            : cinematicSequenceProfile('conversation');
    return scaleCinematicProfile(profile, this.cinematicScale);
  }

  private cinematicTransforms(
    target: Readonly<Guest['position']>,
    targetHeight: number,
    profile: CinematicSequenceProfile,
  ): CinematicTransformSet {
    const center = worldToCharacterDiorama(target);
    const prop = worldToCharacterDiorama(profile.propAnchor ?? target);
    const detailCenter = { x: (center.x + prop.x) / 2, z: (center.z + prop.z) / 2 };
    const fov = (beat: 'establishing' | 'detail' | 'reaction'): number => (
      profile.shots.find((shot) => shot.beat === beat)?.fieldOfView ?? 24
    );
    return {
      establishing: {
        position: { x: center.x, y: 6.08, z: center.z + 13.65 },
        target: { x: center.x, y: targetHeight, z: center.z },
        fieldOfView: fov('establishing'),
      },
      detail: {
        position: { x: detailCenter.x, y: 4.72, z: detailCenter.z + 10.7 },
        target: { x: detailCenter.x, y: Math.max(1.12, targetHeight * 0.58), z: detailCenter.z },
        fieldOfView: fov('detail'),
      },
      reaction: {
        position: { x: center.x, y: 5.28, z: center.z + 11.55 },
        target: { x: center.x, y: targetHeight, z: center.z },
        fieldOfView: fov('reaction'),
      },
    };
  }

  private positionForParticipant(id: string, snapshot: SceneSnapshot): Guest['position'] | undefined {
    if (id === 'barista') return snapshot.barista.position;
    return snapshot.guests.find((guest) => guest.id === id)?.position;
  }

  private nearestGuestIds(snapshot: SceneSnapshot, target: Guest['position'], count: number): readonly string[] {
    return [...snapshot.guests]
      .sort((left, right) => (
        Math.hypot(left.position.x - target.x, left.position.y - target.y)
        - Math.hypot(right.position.x - target.x, right.position.y - target.y)
      ))
      .slice(0, count)
      .map((guest) => guest.id);
  }

  private overviewCameraTransform(): CameraTransform {
    const worldCenter = this.camera.x + this.sceneWidth / 2;
    // Im ruhigen Ausschnitt (Handy, Tablet hochkant) sitzt die Kamera je Ort anders; je breiter das Fenster, desto weniger.
    const narrowness = this.reducedMotion
      ? Math.max(0, Math.min(1, (WORLD_WIDTH - this.sceneWidth) / (WORLD_WIDTH - 210)))
      : 0;
    const venueOffset = (this.venue === 'cafe' ? -1.4 : this.venue === 'ramen' ? -3.1 : 4.5) * narrowness;
    const overviewX = cameraPanForWorldX(worldCenter) - DIORAMA.width / 2 + venueOffset;
    const wideTargetY = this.venue === 'arcade' ? 1.9 : 2.55;
    const narrowTargetY = this.venue === 'cafe' ? 2.3 : this.venue === 'ramen' ? 1.8 : 1.45;
    const targetY = wideTargetY + (narrowTargetY - wideTargetY) * narrowness;
    return {
      position: { x: overviewX, y: 6.7, z: 15.8 },
      target: { x: overviewX, y: targetY, z: -0.2 },
      fieldOfView: 30,
    };
  }

  private updateCamera(): void {
    const transform = this.focusState.active
      ? { position: this.focusState.position, target: this.focusState.lookAt, fieldOfView: this.focusState.fieldOfView }
      : this.overviewCameraTransform();
    this.perspective.position.set(
      transform.position.x + this.focusPanX,
      transform.position.y + this.focusPanY,
      transform.position.z,
    );
    const framedFov = this.fitFieldOfView(this.focusState.active && this.focusState.amount > 0.7
      ? Math.min(30, transform.fieldOfView + this.focusFovLift)
      : transform.fieldOfView);
    if (Math.abs(this.perspective.fov - framedFov) > 0.001) {
      this.perspective.fov = framedFov;
      this.perspective.updateProjectionMatrix();
    }
    this.perspective.lookAt(
      transform.target.x + this.focusPanX,
      transform.target.y + this.focusPanY,
      transform.target.z,
    );
  }

  /** Die Automaten spielen, wenn jemand davorsteht; beim Highscore jubeln sie, in der Geschichte vom kaputten Automaten spinnt er. */
  private updateSeatSteam(snapshot: SceneSnapshot): void {
    for (const [spotId, steam] of this.venueSet.seatSteam) {
      steam.visible = snapshot.guests.some((guest) => guest.state === 'activity' && guest.activitySpotId === spotId);
    }
  }

  private updateArcadeScreens(snapshot: SceneSnapshot, time: number): void {
    if (this.venueSet.screens.length === 0) return;
    const moment = snapshot.moment;
    const progress = moment && moment.duration > 0 ? moment.elapsed / moment.duration : 0;
    for (const [index, screen] of this.venueSet.screens.entries()) {
      const player = snapshot.guests.find((guest) => guest.state === 'activity' && guest.activitySpotId === screen.spotId);
      const involved = player !== undefined && moment?.participantIds.includes(player.id) === true;
      // Bei der Leuchtwelle jubeln die Automaten nacheinander, wie eine Welle durch den Raum.
      const wave = moment?.kind === 'attract-mode-wave' && Math.sin(time * 2.4 - index * 0.95) > 0.3;
      screen.update(time, {
        still: this.reducedMotion,
        playing: player !== undefined,
        celebrating: wave || (involved && moment?.kind === 'arcade-high-score'),
        glitching: involved && moment?.story === 'glitched-coop' && moment.storyStep === 1,
        rebooting: involved && moment?.kind === 'cabinet-reboot' ? progress : undefined,
      });
    }
  }

  private updateVenue(time: number): void {
    if (this.reducedMotion) return;
    for (const prop of this.venueSet.animatedProps) {
      const value = Math.sin(time * prop.speed + prop.phase) * prop.amplitude;
      const key = `diorama-base-${prop.axis}`;
      const knownBase = prop.object.userData[key];
      const base = typeof knownBase === 'number' ? knownBase : prop.object.position[prop.axis];
      prop.object.userData[key] = base;
      prop.object.position[prop.axis] = base + value;
    }
  }

  private updateDoor(guests: readonly Guest[], venue: VenueKind): void {
    const active = doorShouldBeOpen(guests, venue);
    const target = active ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * (this.reducedMotion ? 1 : 0.09);
    const pivot = this.venueSet.doorPivot;
    const closedRotation = Number(pivot.userData.closedRotation ?? 0);
    const openSign = Number(pivot.userData.openSign ?? 1);
    const maxOpen = Number(pivot.userData.maxOpen ?? Math.PI / 2);
    pivot.rotation.y = closedRotation + openSign * this.doorOpen * maxOpen;
  }

  private updateCharacters(snapshot: SceneSnapshot, time: number, dialogue: readonly DialogueLine[]): void {
    const placements = this.resolveDialoguePlacements(snapshot, dialogue);
    const lines = new Map(dialogue.map((line) => [line.speakerId, line]));
    this.visibleDialogue = dialogue.filter((line) => placements.get(line.speakerId)?.visible !== false);
    this.activeSpeechBubbles = this.visibleDialogue.length;
    const visibleIds = new Set(snapshot.guests.map((guest) => guest.id));
    for (const [id, node] of this.guestNodes) {
      if (visibleIds.has(id)) continue;
      node.root.removeFromParent();
      this.disposeCharacterNode(node);
      this.guestNodes.delete(id);
    }

    for (const guest of snapshot.guests) {
      let node = this.guestNodes.get(guest.id);
      if (!node) {
        node = this.createCharacterNode(guest.id);
        this.guestNodes.set(guest.id, node);
        this.scene.add(node.root);
      }
      const participantPositions = snapshot.moment?.participantIds
        .map((id) => snapshot.guests.find((entry) => entry.id === id)?.position)
        .filter((value): value is Guest['position'] => value !== undefined) ?? [];
      const activitySpot = activitySpotById(VENUE_LAYOUTS[snapshot.venue], guest.activitySpotId);
      const visual = calculateGuestVisualState({
        guest,
        moment: snapshot.moment,
        accident: snapshot.accident,
        reaction: this.activeReaction,
        time,
        frameRate: this.qualityProfile.characterFrameRate,
        reducedMotion: this.reducedMotion,
        participantCenterX: participantMidpoint(participantPositions)?.x,
        activityPose: activitySpot?.pose,
        activitySpotKind: activitySpot?.kind,
        activityFacing: activitySpot?.facing,
        seatOrientation: activitySpot?.pose === 'seated' ? activitySpot.seatOrientation : undefined,
      });
      this.updateGuestNode(node, guest, visual, lines.get(guest.id), placements.get(guest.id), activitySpot);
    }
    const baristaVisual = calculateBaristaVisualState({
      barista: snapshot.barista,
      moment: snapshot.moment,
      accident: snapshot.accident,
      reaction: this.activeReaction,
      time,
      frameRate: this.qualityProfile.characterFrameRate,
      reducedMotion: this.reducedMotion,
    });
    this.updateBaristaNode(
      this.baristaNode,
      snapshot.barista,
      baristaVisual,
      lines.get('barista'),
      placements.get('barista'),
    );
  }

  private updateGuestNode(
    node: CharacterNode,
    guest: Guest,
    visual: CharacterVisualState,
    dialogue?: DialogueLine,
    placement?: Readonly<SpeechBubblePlacement>,
    activitySpot?: ActivitySpot,
  ): void {
    const seated = visual.seated;
    // Sitzende Gäste sitzen genau auf der Sitzfläche ihres Möbels.
    const seat = seated
      ? this.venueSet.seatBindings.find((binding) => binding.activitySpotId === guest.activitySpotId)?.transform.seatCenter
      : undefined;
    const point = seat ?? worldToCharacterDiorama(guest.position);
    const { holdYaw } = advanceMotion(node.motion, {
      seated,
      point,
      offsetX: visual.offsetX,
      seat: seat && activitySpot?.pose === 'seated' ? { x: seat.x, z: seat.z, yaw: seatYawFor(activitySpot.seatOrientation) } : undefined,
      deltaSeconds: this.figureDelta,
    });
    node.root.position.set(node.motion.x, FLOOR_SURFACE_Y + visual.offsetY, node.motion.z);
    const figureKey = `${this.venue}|${guest.accessory ?? 'none'}|${halloweenHat(this.season, guest.id) ?? ''}`;
    if (!node.figure || node.figureKey !== figureKey) {
      node.figure?.root.removeFromParent();
      node.figure?.dispose();
      node.figure = new VoxelFigure({
        palette: guest.palette, appearance: guest.appearance, venue: this.venue, accessory: guest.accessory,
        seed: Number.parseInt(guest.id.replace(/\D/g, ''), 10) || 0,
        hat: halloweenHat(this.season, guest.id),
      });
      node.root.add(node.figure.root);
      node.figureKey = figureKey;
    }
    const next = guest.waypoints?.[0] ?? guest.target;
    // Gehen hängt daran, ob sich der Gast bewegt: Auch wer zur Schlange läuft, setzt die Füße voreinander.
    const stepping = !seated && trackStepping(node.motion, worldToCharacterDiorama(guest.position), this.figureTime);
    node.figure.update({
      visual: !stepping && visual.pose === 'walking' ? { ...visual, pose: 'waiting' } : visual,
      stepping,
      seatView: visual.seatView,
      spotKind: visual.activitySpotKind,
      heading: { x: (next.x - guest.position.x) / 384 * DIORAMA.width, z: (next.y - guest.position.y) / 86 * DIORAMA.depth },
      yawOverride: approachYawFor(guest, activitySpot) ?? holdYaw,
      ...cupFor(guest, this.reducedMotion),
      seatHeight: SEAT_TOP_HEIGHT[visual.activitySpotKind ?? 'table'],
      time: this.figureTime,
    });
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : guest.facing > 0;
    node.speech.update(
      dialogue,
      this.venue,
      tailLeft,
      seated ? seatedHeadHeight(visual.activitySpotKind) : DIORAMA.standingHeight,
      placement,
    );
    node.shadow.scale.set(seated ? 0.92 : 0.72, seated ? 1.3 : 1, 1);
    node.shadow.material.opacity = 0.12 + this.look.daylight * 0.05;
    node.root.renderOrder = Math.round(point.z * 100);
  }

  private updateBaristaNode(
    node: CharacterNode,
    barista: Barista,
    visual: CharacterVisualState,
    dialogue?: DialogueLine,
    placement?: Readonly<SpeechBubblePlacement>,
  ): void {
    const point = worldToCharacterDiorama(barista.position);
    // Setzt die Simulation die Bedienung sofort um (Szenen an der Theke), läuft sie in der Darstellung hinüber.
    const follow = followPoint(node.motion, { x: point.x + visual.offsetX, z: point.z }, this.figureDelta);
    const catchingUp = follow.lag > 0.02;
    node.root.position.set(node.motion.x, FLOOR_SURFACE_Y + visual.offsetY, node.motion.z);
    const figureKey = `barista|${this.venue}`;
    if (!node.figure || node.figureKey !== figureKey) {
      node.figure?.root.removeFromParent();
      node.figure?.dispose();
      node.figure = new VoxelFigure({ palette: BARISTA_PALETTES[this.venue], appearance: BARISTA_APPEARANCE, venue: this.venue, barista: true, seed: 7 });
      node.root.add(node.figure.root);
      node.figureKey = figureKey;
    }
    const walkingTo = catchingUp ? follow.heading : { x: (barista.target.x - barista.position.x) / 384 * DIORAMA.width, z: 0 };
    node.figure.update({
      visual: catchingUp && visual.pose !== 'walking' ? { ...visual, pose: 'walking' } : visual,
      // Auch mit dem Tablett in der Hand geht die Bedienung zur Ausgabe, statt zu gleiten.
      stepping: catchingUp || Math.hypot(barista.target.x - barista.position.x, barista.target.y - barista.position.y) > 0.2,
      // Beim Polieren hat die Bedienung eine leere Tasse in der Hand.
      cupFill: barista.task === 'polishing' ? 0 : 1,
      heading: walkingTo,
      seatHeight: 0,
      time: this.figureTime,
    });
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : barista.facing > 0;
    node.speech.update(dialogue, this.venue, tailLeft, DIORAMA.standingHeight, placement);
    node.root.rotation.y = 0;
  }

  private resolveDialoguePlacements(
    snapshot: SceneSnapshot,
    dialogue: readonly DialogueLine[],
  ): ReadonlyMap<string, SpeechBubblePlacement> {
    if (dialogue.length === 0) return new Map();
    this.perspective.updateMatrixWorld(true);
    const bounds = dialogue
      .map((line) => this.projectBubbleBounds(line, snapshot))
      .filter((entry): entry is BubbleBounds => entry !== undefined);
    const projected = new Map(bounds.map((entry) => [entry.speakerId, entry]));
    const screenWidth = this.canvas.getBoundingClientRect().width;
    const placements = keepBubblesOnScreen(
      bounds,
      avoidFaces(bounds, resolveBubblePlacements(bounds), this.projectFaces(), screenWidth),
      screenWidth,
    );
    return new Map(dialogue.map((line) => {
      const placement = placements.find((entry) => entry.speakerId === line.speakerId);
      const bubbleBounds = projected.get(line.speakerId);
      if (!placement || !bubbleBounds) return [line.speakerId, { visible: true, offsetX: 0, offsetY: 0 }];
      return [line.speakerId, {
        visible: placement.visible,
        offsetX: bubbleBounds.width > 0
          ? placement.offsetX / bubbleBounds.width * SPEECH_BUBBLE_WORLD_WIDTH
          : 0,
        offsetY: bubbleBounds.height > 0
          ? -placement.offsetY / bubbleBounds.height * SPEECH_BUBBLE_WORLD_HEIGHT
          : 0,
      }];
    }));
  }

  private projectBubbleBounds(line: DialogueLine, snapshot: SceneSnapshot): BubbleBounds | undefined {
    const guest = snapshot.guests.find((entry) => entry.id === line.speakerId);
    const participant = guest ?? (line.speakerId === 'barista' ? snapshot.barista : undefined);
    if (!participant) return undefined;
    // Wo die Figur gezeichnet wird (Sitzmitte, Gleiten aufs Polster), nicht wo die Simulation sie führt.
    const node = line.speakerId === 'barista' ? this.baristaNode : this.guestNodes.get(line.speakerId);
    const point = node?.figure ? { x: node.root.position.x, z: node.root.position.z } : worldToCharacterDiorama(participant.position);
    const spot = guest?.state === 'activity' ? activitySpotById(VENUE_LAYOUTS[snapshot.venue], guest.activitySpotId) : undefined;
    const characterHeight = guest ? characterTop(spot) : DIORAMA.standingHeight;
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : participant.facing > 0;
    const center = new Vector3(
      point.x + (tailLeft ? 0.35 : -0.35),
      0.07 + characterHeight + 0.48 + line.bob,
      point.z + 0.03,
    );
    const right = new Vector3(1, 0, 0).applyQuaternion(this.perspective.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.perspective.quaternion);
    const halfWidth = SPEECH_BUBBLE_WORLD_WIDTH * line.scale / 2;
    const halfHeight = SPEECH_BUBBLE_WORLD_HEIGHT * line.scale / 2;
    const leftPoint = center.clone().addScaledVector(right, -halfWidth).project(this.perspective);
    const rightPoint = center.clone().addScaledVector(right, halfWidth).project(this.perspective);
    const topPoint = center.clone().addScaledVector(up, halfHeight).project(this.perspective);
    const bottomPoint = center.clone().addScaledVector(up, -halfHeight).project(this.perspective);
    const projectedCenter = center.project(this.perspective);
    const canvasBounds = this.canvas.getBoundingClientRect();
    return {
      speakerId: line.speakerId,
      kind: line.kind,
      x: (projectedCenter.x + 1) * canvasBounds.width / 2,
      y: (1 - projectedCenter.y) * canvasBounds.height / 2,
      width: Math.abs(rightPoint.x - leftPoint.x) * canvasBounds.width / 2,
      height: Math.abs(topPoint.y - bottomPoint.y) * canvasBounds.height / 2,
    };
  }

  private updateFocusEffects(snapshot: SceneSnapshot): void {
    const activeIds = new Set(this.focusState.participantIds);
    if (!this.focusState.active || activeIds.size === 0) {
      this.restoreFocusEffects();
      return;
    }

    const participantNodes = [...activeIds]
      .map((id) => id === 'barista' ? this.baristaNode : this.guestNodes.get(id))
      .filter((node): node is CharacterNode => node !== undefined);
    if (participantNodes.length > 0) {
      const center = participantNodes.reduce((sum, node) => sum.add(node.root.position), new Vector3())
        .multiplyScalar(1 / participantNodes.length);
      this.focusLight.position.set(center.x, 2.5, center.z + 1.15);
      this.focusLight.color.copy(this.look.focusColor);
      const lightCue = snapshot.moment
        ? momentDefinition(snapshot.moment.kind)?.cues.find((cue) => (
          cue.type === 'light'
          && snapshot.moment!.elapsed >= cue.atSeconds
          && snapshot.moment!.elapsed <= cue.atSeconds + cue.durationSeconds
        ))
        : undefined;
      const cuePulse = lightCue?.type === 'light'
        ? Math.sin(Math.PI * Math.min(1, Math.max(0, (snapshot.moment!.elapsed - lightCue.atSeconds) / lightCue.durationSeconds)))
        : 0;
      this.focusLight.intensity = this.focusState.amount * (this.venue === 'arcade' ? 0.16 : 0.12)
        + cuePulse * (lightCue?.type === 'light' ? lightCue.intensity : 0) * 0.08;
    }

    const targets: FocusVisibilityTarget[] = [];
    for (const id of activeIds) {
      const guest = snapshot.guests.find((entry) => entry.id === id);
      const node = id === 'barista' ? this.baristaNode : this.guestNodes.get(id);
      if (!node) continue;
      const spot = activitySpotById(VENUE_LAYOUTS[snapshot.venue], guest?.activitySpotId);
      const height = guest?.state === 'activity' ? characterTop(spot) : DIORAMA.standingHeight;
      targets.push({
        id,
        position: node.root.position,
        height,
        width: height * DIORAMA.figureFrameAspect,
      });
    }
    this.scene.updateMatrixWorld(true);
    const selected = selectFocusOccluders(this.perspective.position, targets, this.venueSet.focusOccluders);
    const selectedSet = new Set(selected);
    restoreFocusOccluders(this.activeFocusOccluders.filter((occluder) => !selectedSet.has(occluder)));
    for (const occluder of selected) fadeFocusOccluder(occluder, this.focusState.amount);
    this.activeFocusOccluders = selected;
  }

  private restoreFocusEffects(): void {
    restoreFocusOccluders(this.activeFocusOccluders);
    this.activeFocusOccluders = [];
    this.focusLight.intensity = 0;
    this.focusFrameBounds = undefined;
    this.focusFrameSafe = true;
    this.focusFovLift = 0;
    this.focusPanX = 0;
    this.focusPanY = 0;
    this.focusFramingKey = undefined;
  }

  private updateFocusFrame(snapshot: SceneSnapshot): void {
    if (!this.focusState.active || this.focusState.participantIds.length === 0) {
      this.focusFrameBounds = undefined;
      this.focusFrameSafe = true;
      this.focusFovLift = 0;
      this.focusPanX = 0;
      this.focusPanY = 0;
      this.focusFramingKey = undefined;
      return;
    }
    const framingKey = `${this.focusState.source}:${this.focusState.key}:${this.focusState.shotBeat}`;
    if (framingKey !== this.focusFramingKey) {
      this.focusFramingKey = framingKey;
      this.focusFovLift = 0;
      this.focusPanX = 0;
      this.focusPanY = 0;
    }
    this.perspective.updateMatrixWorld(true);
    const elements: FocusFrameElement[] = [];
    const shotBeat = this.focusState.shotBeat;
    const aspect = DIORAMA.figureFrameAspect;
    const project = (value: Vector3): { x: number; y: number } => {
      const projected = value.clone().project(this.perspective);
      return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
    };
    for (const id of this.focusState.participantIds) {
      const guest = snapshot.guests.find((entry) => entry.id === id);
      const node = id === 'barista' ? this.baristaNode : this.guestNodes.get(id);
      if (!node) continue;
      const spot = activitySpotById(VENUE_LAYOUTS[snapshot.venue], guest?.activitySpotId);
      const seated = guest?.state === 'activity' && spot?.pose === 'seated';
      const height = seated ? seatedHeadHeight(spot?.kind) : DIORAMA.standingHeight;
      const halfWidth = height * aspect * 0.56;
      if (shotBeat !== 'detail') {
        const lowerY = shotBeat === 'reaction' ? node.root.position.y + height * 0.55 : node.root.position.y;
        const reactionWidth = shotBeat === 'reaction' ? halfWidth * 0.82 : halfWidth;
        const bottomLeft = project(new Vector3(node.root.position.x - reactionWidth, lowerY, node.root.position.z));
        const topRight = project(new Vector3(node.root.position.x + reactionWidth, node.root.position.y + height, node.root.position.z));
        elements.push({
          left: Math.min(bottomLeft.x, topRight.x),
          top: Math.min(bottomLeft.y, topRight.y),
          right: Math.max(bottomLeft.x, topRight.x),
          bottom: Math.max(bottomLeft.y, topRight.y),
          role: 'participant',
        });
      }
      if (shotBeat === 'detail' || shotBeat === 'establishing') {
        const propReach = halfWidth * 1.28;
        const handsLeft = project(new Vector3(node.root.position.x - propReach, node.root.position.y + height * 0.38, node.root.position.z + 0.03));
        const handsRight = project(new Vector3(node.root.position.x + propReach, node.root.position.y + height * 0.7, node.root.position.z + 0.03));
        elements.push({
          left: Math.min(handsLeft.x, handsRight.x),
          top: Math.min(handsLeft.y, handsRight.y),
          right: Math.max(handsLeft.x, handsRight.x),
          bottom: Math.max(handsLeft.y, handsRight.y),
          role: 'hands-prop',
        });
      }
    }
    if (shotBeat === 'detail' && snapshot.moment) {
      const anchor = momentDefinition(snapshot.moment.kind)?.propAnchor;
      if (anchor) {
        const point = worldToCharacterDiorama(anchor);
        const lower = project(new Vector3(point.x - 0.52, 0.82, point.z + 0.08));
        const upper = project(new Vector3(point.x + 0.52, 1.9, point.z + 0.08));
        elements.push({
          left: Math.min(lower.x, upper.x), top: Math.min(lower.y, upper.y),
          right: Math.max(lower.x, upper.x), bottom: Math.max(lower.y, upper.y),
          role: 'hands-prop',
        });
      }
    }
    const canvasBounds = this.canvas.getBoundingClientRect();
    for (const line of this.visibleDialogue.filter((entry) => (
      shotBeat === 'establishing' && this.focusState.participantIds.includes(entry.speakerId)
    ))) {
      const bounds = this.projectBubbleBounds(line, snapshot);
      if (!bounds || canvasBounds.width <= 0 || canvasBounds.height <= 0) continue;
      elements.push({
        left: (bounds.x - bounds.width / 2) / canvasBounds.width,
        top: (bounds.y - bounds.height / 2) / canvasBounds.height,
        right: (bounds.x + bounds.width / 2) / canvasBounds.width,
        bottom: (bounds.y + bounds.height / 2) / canvasBounds.height,
        role: 'speech-bubble',
      });
    }
    this.focusFrameBounds = calculateFocusFrameBounds(elements);
    const safeArea = VENUE_VISUAL_PROFILES[this.venue].camera.safeArea;
    this.focusFrameSafe = this.focusFrameBounds ? focusBoundsAreSafe(this.focusFrameBounds, safeArea) : true;
    const overshoot = this.focusFrameBounds
      ? Math.max(
        0,
        safeArea.left - this.focusFrameBounds.left,
        this.focusFrameBounds.right - safeArea.right,
        safeArea.top - this.focusFrameBounds.top,
        this.focusFrameBounds.bottom - safeArea.bottom,
      )
      : 0;
    if (!this.focusFrameSafe) {
      const targetLift = Math.min(8, Math.max(this.focusFovLift + 0.5, 0.8 + overshoot * 32));
      this.focusFovLift = Math.max(this.focusFovLift, targetLift);
    }
    if (this.focusFrameBounds) {
      const centerX = (this.focusFrameBounds.left + this.focusFrameBounds.right) / 2;
      const centerY = (this.focusFrameBounds.top + this.focusFrameBounds.bottom) / 2;
      this.focusPanX = Math.max(-3, Math.min(3, this.focusPanX + (centerX - 0.5) * 2.4));
      this.focusPanY = Math.max(-2, Math.min(2, this.focusPanY + (0.5 - centerY) * 1.8));
    }
  }

  private updateWeather(time: number): void {
    const weather = this.environment?.weather.kind ?? 'clear';
    const visible = weather === 'rain' || weather === 'storm' || weather === 'snow';
    for (const layer of this.weatherLayers) layer.visible = visible;
    if (!visible) return;
    for (const layer of this.weatherLayers) {
      layer.material.color.set(weather === 'snow' ? '#e6edf0' : '#8eb3c5');
      layer.material.size = weather === 'snow' ? 0.073 : 0.038;
      layer.material.opacity = weather === 'storm' ? 0.66 : 0.48;
      const positions = layer.geometry.getAttribute('position') as BufferAttribute;
      const masterCount = weather === 'storm' ? 252 : weather === 'snow' ? 180 : 198;
      const qualityScale = this.qualityTier === 'master' ? 1 : this.qualityTier === 'balanced' ? 0.64 : 0.38;
      // Schmale Fenster brauchen weniger Tropfen für dieselbe Dichte.
      const opening = VENUE_WINDOWS[this.venue];
      const widthScale = Math.max(0.3, (opening.maxX - opening.minX) / 10.9);
      const fullCount = Math.round(masterCount * qualityScale * widthScale);
      const count = this.reducedMotion ? Math.min(54, fullCount) : fullCount;
      layer.geometry.setDrawRange(0, count);
      if (this.reducedMotion) continue;
      for (let index = 0; index < count; index += 1) {
        const depthBand = index % 3;
        const seedIndex = index + depthBand * 97;
        const base = seeded(seedIndex, 3);
        const speed = weather === 'snow' ? 0.3 + seeded(seedIndex, 4) * 0.18 : 1.1 + depthBand * 0.28 + seeded(seedIndex, 4) * 0.65;
        const y = ((base * 8.5 - time * speed) % 8.5 + 8.5) % 8.5 + 0.4;
        positions.setY(index, y);
        if (weather === 'snow') positions.setX(index, this.rainX(seedIndex) + Math.sin(time + seedIndex) * 0.12);
      }
      positions.needsUpdate = true;
    }
  }

  /** Was der Untertitel eines Moments nennt, liegt auch da: der Kuchen, die Karten, das letzte Gyoza. */
  private updateMomentProp(snapshot: SceneSnapshot): void {
    const moment = snapshot.moment;
    if (this.momentProp && this.momentProp.kind !== moment?.kind) {
      this.momentProp.group.removeFromParent();
      this.momentProp = undefined;
    }
    if (!moment || !momentPropSurface(moment.kind)) return;
    if (!this.momentProp) {
      const group = this.momentProps.get(moment.kind);
      const place = this.momentPropPlacement(snapshot, moment);
      if (!group || !place) return;
      group.position.copy(place);
      // Etwas größer als echt, damit man Kuchen, Karten und Tickets aus der Entfernung erkennt.
      group.scale.setScalar(MOMENT_PROP_SCALE);
      this.scene.add(group);
      this.momentProp = { kind: moment.kind, group };
    }
    const progress = moment.duration > 0 ? moment.elapsed / moment.duration : 1;
    this.momentProps.animate(moment.kind, this.momentProp.group, this.reducedMotion ? 1 : progress);
  }

  /** Wo der Gegenstand eines Moments liegt: auf dem Tisch, der Theke oder Bank zwischen den Beteiligten, sonst am Boden. */
  private momentPropPlacement(snapshot: SceneSnapshot, moment: CafeMoment): Vector3 | undefined {
    const fixed = momentPropFixedPosition(moment.kind);
    if (fixed) return new Vector3(...fixed);
    const layout = VENUE_LAYOUTS[snapshot.venue];
    const guests = moment.participantIds
      .map((id) => snapshot.guests.find((guest) => guest.id === id))
      .filter((guest): guest is Guest => guest !== undefined);
    if (guests.length === 0) return undefined;
    const points = guests.map((guest) => {
      const node = this.guestNodes.get(guest.id);
      return node?.figure ? { x: node.motion.x, z: node.motion.z } : worldToCharacterDiorama(guest.position);
    });
    const mid = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, z: points.reduce((sum, point) => sum + point.z, 0) / points.length };
    // Am Boden ein Stück in den Gang hinein, Richtung Raummitte und Kamera, damit niemand davorsteht.
    if (momentPropSurface(moment.kind) === 'floor') return new Vector3(mid.x - Math.sign(mid.x) * 0.7, FLOOR_SURFACE_Y, mid.z + 0.55);
    const spots = guests.map((guest) => activitySpotById(layout, guest.activitySpotId));
    const tableSpot = spots.find((spot) => spot?.kind === 'table');
    if (tableSpot) {
      // Mitte des Tisches, an dem die Beteiligten sitzen.
      const seat = worldToDiorama(tableSpot);
      const table = layout.colliders
        .filter((collider) => collider.id.includes('table'))
        .map((collider) => worldToDiorama({ x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 }))
        .sort((left, right) => Math.hypot(left.x - seat.x, left.z - seat.z) - Math.hypot(right.x - seat.x, right.z - seat.z))[0];
      // Vorn auf dem Tisch, vor Tassen und Laterne in der Tischmitte.
      if (table) return new Vector3(table.x, TABLE_TOP_Y, table.z + 0.2);
    }
    if (spots.some((spot) => spot?.kind === 'counter-stool')) {
      // Zwischen zwei Schüsseln; bei nur einem Gast neben dessen Schüssel.
      return new Vector3(guests.length > 1 ? mid.x : mid.x + 0.55, RAMEN_COUNTER_TOP_Y, RAMEN_COUNTER_PROP_Z);
    }
    const bench = spots.find((spot) => spot?.kind === 'bench');
    if (bench) return new Vector3(guests.length > 1 ? mid.x : worldToDiorama(bench).x + 0.55, CAFE_BENCH_TOP_Y, CAFE_BENCH_Z);
    const lounge = guests.find((guest) => activitySpotById(layout, guest.activitySpotId)?.kind === 'lounge');
    if (lounge) {
      const node = this.guestNodes.get(lounge.id);
      return new Vector3((node?.motion.x ?? 0) + 0.55, LOUNGE_SEAT_TOP_Y, LOUNGE_SEAT_Z);
    }
    return new Vector3(mid.x, FLOOR_SURFACE_Y, mid.z + 0.3);
  }

  private updateEvent(snapshot: SceneSnapshot, time: number): void {
    const accident = snapshot.accident;
    const moment = snapshot.moment;
    this.eventAccent.visible = Boolean(accident || moment);
    if (!this.eventAccent.visible) return;
    let point = accident?.position;
    if (!point && moment) {
      const guest = snapshot.guests.find((entry) => moment.participantIds.includes(entry.id));
      point = guest?.position;
    }
    if (!point) return;
    const mapped = worldToCharacterDiorama(point);
    this.eventAccent.position.set(mapped.x, 0.12, mapped.z);
    this.eventAccent.material.color.set(accident ? '#ed766b' : this.venueSet.theme.glow);
    this.eventAccent.material.opacity = 0.25 + Math.sin(time * 4) * 0.08;
    const scale = 0.85 + Math.sin(time * 2.7) * 0.08;
    this.eventAccent.scale.setScalar(scale);
  }

  private updateDatasets(snapshot: SceneSnapshot): void {
    const { accident, moment } = snapshot;
    this.canvas.dataset.cameraX = this.camera.x.toFixed(1);
    this.canvas.dataset.guestCount = String(snapshot.guests.length);
    this.canvas.dataset.accident = accident?.kind ?? 'none';
    this.canvas.dataset.moment = moment?.kind ?? 'none';
    this.canvas.dataset.story = moment?.story ?? 'none';
    this.canvas.dataset.storyStep = String(moment?.storyStep ?? 0);
    this.canvas.dataset.regulars = snapshot.regularIds.join(',');
    this.canvas.dataset.venue = snapshot.venue;
    this.canvas.dataset.clockTime = this.environment?.localTimeText ?? '00:00';
    this.canvas.dataset.emoteBubbles = String(this.activeSpeechBubbles);
    this.canvas.dataset.reactingCharacter = this.activeReaction?.characterId ?? 'none';
    this.canvas.dataset.cameraFocus = this.focusState.active ? 'active' : 'none';
    this.canvas.dataset.cameraFocusSource = this.focusState.source ?? 'none';
    this.canvas.dataset.reactionTargets = this.reactionTargets
      .map((target) => `${target.id}:${Math.round(target.x)},${Math.round(target.y)}`)
      .join('|');
  }

  /** Köpfe aller Figuren auf dem Bildschirm (CSS-Pixel), damit Sprechblasen ihnen ausweichen können. */
  private projectFaces(): FaceBox[] {
    const bounds = this.canvas.getBoundingClientRect();
    const right = new Vector3(1, 0, 0).applyQuaternion(this.perspective.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.perspective.quaternion);
    const faces: FaceBox[] = [];
    const nodes: [string, CharacterNode][] = [...this.guestNodes.entries(), ['barista', this.baristaNode]];
    for (const [id, node] of nodes) {
      if (!node.figure) continue;
      const center = node.figure.headCenter(new Vector3());
      const corners = [[-1, -1], [1, 1]].map(([x, y]) => {
        const projected = center.clone().addScaledVector(right, x! * 0.32).addScaledVector(up, y! * 0.34).project(this.perspective);
        return { x: (projected.x + 1) * bounds.width / 2, y: (1 - projected.y) * bounds.height / 2 };
      });
      const [a, b] = corners as [{ x: number; y: number }, { x: number; y: number }];
      faces.push({ id, left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) });
    }
    return faces;
  }

  /**
   * Nur im Testmodus: wo Sprechblasen und Köpfe gerade auf dem Bildschirm liegen (CSS-Pixel), damit Tests
   * prüfen können, ob Blasen einander oder Gesichter verdecken oder aus dem Bild ragen.
   */
  private measureBubbleLayout(): {
    readonly width: number;
    readonly height: number;
    readonly bubbles: readonly ScreenRect[];
    readonly heads: readonly ScreenRect[];
  } {
    const bounds = this.canvas.getBoundingClientRect();
    const toScreen = (point: Vector3): { x: number; y: number } => {
      const projected = point.project(this.perspective);
      return { x: (projected.x + 1) * bounds.width / 2, y: (1 - projected.y) * bounds.height / 2 };
    };
    const rect = (id: string, points: readonly { x: number; y: number }[]): ScreenRect => ({
      id,
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
    });
    const bubbles: ScreenRect[] = [];
    const heads: ScreenRect[] = [];
    const halfWidth = SPEECH_BUBBLE_WORLD_WIDTH / 2;
    const halfHeight = SPEECH_BUBBLE_WORLD_HEIGHT / 2;
    const right = new Vector3(1, 0, 0).applyQuaternion(this.perspective.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.perspective.quaternion);
    const nodes: [string, CharacterNode][] = [...this.guestNodes.entries(), ['barista', this.baristaNode]];
    for (const [id, node] of nodes) {
      node.root.updateMatrixWorld(true);
      const mesh = node.speech.mesh;
      if (mesh.visible && mesh.material.opacity > 0.2) {
        bubbles.push(rect(id, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => toScreen(
          new Vector3(x! * halfWidth, y! * halfHeight, 0).applyMatrix4(mesh.matrixWorld),
        ))));
      }
      if (node.figure) {
        const center = node.figure.headCenter(new Vector3());
        heads.push(rect(id, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => toScreen(
          center.clone().addScaledVector(right, x! * 0.32).addScaledVector(up, y! * 0.34),
        ))));
      }
    }
    return { width: bounds.width, height: bounds.height, bubbles, heads };
  }

  private createCharacterNode(name: string): CharacterNode {
    const root = new Group();
    root.name = `character:${name}`;
    const shadowGeometry = new CircleGeometry(0.62, 24);
    const shadowMaterial = new MeshBasicMaterial({ color: '#130f18', transparent: true, opacity: 0.28, depthWrite: false });
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    root.add(shadow);
    const speech = new SpeechBubble(name);
    root.add(speech.mesh);
    return { root, shadow, speech, figureKey: '', motion: newMotionState() };
  }

  /**
   * Leichter Lichtrand für alle Figuren (nachts stärker), damit sie sich vom Raum abheben.
   * Wer gerade im Kamerafokus einer Geschichte oder eines Moments steht, schimmert deutlicher.
   */
  private updateFigureGlow(time: number): void {
    this.rimColor.set(VENUE_VISUAL_PROFILES[this.venue].lights.characterRim);
    const base = this.look.characterEmissive * 1.4;
    const focus = this.focusState.active ? Math.min(1, this.focusState.amount) : 0;
    const pulse = this.reducedMotion ? 1 : 0.85 + Math.sin(time * 2.4) * 0.15;
    const participants = new Set(this.focusState.participantIds);
    const glow = (id: string, node: CharacterNode): void => {
      const lift = participants.has(id) ? focus * 0.55 * pulse : 0;
      node.figure?.setGlow(this.rimColor, base + lift);
    };
    for (const [id, node] of this.guestNodes) glow(id, node);
    glow('barista', this.baristaNode);
  }

  /** Der Klingelknauf wippt nach einem Klick kurz nach. */
  private updateBell(time: number): void {
    const since = time - this.bellRungAt;
    const dome = this.venueSet.bellDome;
    dome.position.y = since >= 0 && since < 0.6 && !this.reducedMotion ? -Math.abs(Math.sin(since * 26)) * 0.025 * (1 - since / 0.6) : 0;
    if (this.diagnosticRendering) {
      const bounds = this.canvas.getBoundingClientRect();
      const screen = (point: Vector3): string => {
        const projected = point.project(this.perspective);
        return `${Math.round(bounds.left + (projected.x + 1) * bounds.width / 2)},${Math.round(bounds.top + (1 - projected.y) * bounds.height / 2)}`;
      };
      const targets = [`bell:${screen(this.venueSet.bell.getWorldPosition(new Vector3()).add(BELL_CLICK_OFFSET))}`];
      if (this.cat) targets.push(`cat:${screen(this.cat.focusPoint.clone())}`);
      if (this.luckyCat) targets.push(`lucky-cat:${screen(this.luckyCat.focusPoint.clone())}`);
      this.canvas.dataset.clickTargets = targets.join('|');
    }
  }

  private updateCatPresence(): void {
    if (this.venue === 'cafe' && !this.cat) {
      this.cat = new CafeCat({ hat: this.season === 'halloween' });
      this.scene.add(this.cat.root);
    } else if (this.venue !== 'cafe' && this.cat) {
      this.cat.root.removeFromParent();
      this.cat.dispose();
      this.cat = undefined;
    }
    // Im Ramen-Restaurant winkt eine Glückskatze auf der Theke.
    if (this.venue === 'ramen' && !this.luckyCat) {
      this.luckyCat = new LuckyCat();
      this.scene.add(this.luckyCat.root);
    } else if (this.venue !== 'ramen' && this.luckyCat) {
      this.luckyCat.root.removeFromParent();
      this.luckyCat.dispose();
      this.luckyCat = undefined;
    }
  }

  private updateCat(time: number): void {
    this.luckyCat?.update(time, this.reducedMotion);
    if (!this.cat) return;
    const pointer = this.active ? this.pointerSample : undefined;
    const bounds = this.canvas.getBoundingClientRect();
    const petted = this.cat.update(time, this.reducedMotion, (point) => {
      if (!pointer) return false;
      const projected = point.clone().project(this.perspective);
      const x = bounds.left + (projected.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - projected.y) * bounds.height / 2;
      return Math.hypot(pointer.x - x, pointer.y - y) <= REACTION_ACTIVATION_RADIUS;
    }, [...this.guestNodes.values()].map((node) => node.motion));
    if (petted && !this.catPetted) {
      this.catPurrToken += 1;
      this.canvas.dataset.catPurr = String(this.catPurrToken);
    }
    this.catPetted = petted;
  }

  private disposeCharacterNode(node: CharacterNode): void {
    node.shadow.geometry.dispose();
    node.shadow.material.dispose();
    node.speech.dispose();
    node.figure?.dispose();
  }

  private rainX(seedIndex: number): number {
    const opening = VENUE_WINDOWS[this.venue];
    return opening.minX + 0.05 + seeded(seedIndex, 1) * (opening.maxX - opening.minX - 0.1);
  }

  /** Verteilt die Tropfen neu auf das Fenster des aktuellen Ortes. */
  private layoutWeatherForVenue(): void {
    for (const layer of this.weatherLayers) {
      const positions = layer.geometry.getAttribute('position') as BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        positions.setX(index, this.rainX(index + (index % 3) * 97));
      }
      positions.needsUpdate = true;
    }
  }

  private createWeatherParticles(): Points<BufferGeometry, PointsMaterial> {
    const count = 270;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const depthBand = index % 3;
      const seedIndex = index + depthBand * 97;
      positions[index * 3] = this.rainX(seedIndex);
      positions[index * 3 + 1] = 0.3 + seeded(seedIndex, 2) * 8.5;
      positions[index * 3 + 2] = RAIN_Z + depthBand * 0.006 + seeded(seedIndex, 5) * 0.004;
    }
    const geometry = new BufferGeometry();
    const attribute = new BufferAttribute(positions, 3);
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const material = new PointsMaterial({
      color: '#8eb3c5', size: 0.038, transparent: true, opacity: 0.52,
      depthWrite: false, sizeAttenuation: true,
    });
    const particles = new Points(geometry, material);
    particles.frustumCulled = false;
    particles.visible = false;
    return particles;
  }

  private createEventAccent(): Mesh<RingGeometry, MeshBasicMaterial> {
    const geometry = new RingGeometry(0.55, 0.62, 32);
    const material = new MeshBasicMaterial({ color: '#f1c878', transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false });
    const result = new Mesh(geometry, material);
    result.rotation.x = -Math.PI / 2;
    result.visible = false;
    return result;
  }
}

export const RENDER_SCALE = DIORAMA.renderScale;
