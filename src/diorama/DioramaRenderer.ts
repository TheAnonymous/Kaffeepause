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
  MeshStandardMaterial,
  PCFSoftShadowMap,
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
  Texture,
  type Object3D,
} from 'three';
import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import type { AtmosphereSnapshot } from '../atmosphere/types';
import {
  VENUE_LAYOUTS,
  VENUE_LAYOUT_REPORTS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  activitySpotById,
} from '../simulation/layout';
import type { Barista, Guest } from '../simulation/types';
import { momentDefinition } from '../simulation/momentRegistry';
import type { SceneSnapshot } from '../scene/types';
import type { VenueKind } from '../venue';
import { APPEARANCE_LIBRARY_REPORT } from '../simulation/appearance';
import { SCENE_PROPORTION_REPORT, SCENE_PROPORTIONS } from '../scene/proportions';
import {
  RENDER_QUALITY_PROFILES,
  type RenderQualityProfile,
  type RenderQualityTier,
} from '../scene/renderQuality';
import type { RendererFrameMetrics } from '../scene/rendererLifecycle';
import { calculateDioramaLook, type DioramaLook } from './look';
import { calculateDialogue, type DialogueLine } from './dialogue';
import {
  SPEECH_BUBBLE_RESOLUTION,
  SPEECH_BUBBLE_WORLD_HEIGHT,
  SPEECH_BUBBLE_WORLD_WIDTH,
  SpeechBubble,
  type SpeechBubblePlacement,
} from './speechBubble';
import { SpriteTextureLibrary } from './spriteFactory';
import {
  calculateBaristaVisualState,
  calculateGuestVisualState,
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
import { resolveBubblePlacements, type BubbleBounds } from './bubbleLayout';
import {
  fadeFocusOccluder,
  focusOccluderOpacity,
  restoreFocusOccluders,
  selectFocusOccluders,
  type FocusVisibilityTarget,
} from './focusOcclusion';
import {
  DIORAMA,
  DIORAMA_SCALE_REPORT,
  cameraPanForWorldX,
  worldToCharacterDiorama,
  type DioramaSet,
  type FocusOccluder,
} from './types';
import { buildVenue, validateSeatAlignment } from './venueBuilder';
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
import { GOLDEN_LIVING_SEQUENCES, LIVING_ROUTES_BY_VENUE } from '../simulation/livingDirection';

interface CharacterNode {
  readonly root: Group;
  readonly plane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly speech: SpeechBubble;
  textureName: string;
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 91.73 + salt * 17.17) * 43_758.5453;
  return value - Math.floor(value);
}

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
  private readonly spriteTextures = new SpriteTextureLibrary();
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
  private sceneWidth = WORLD_WIDTH;
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
    // Aggregate the selective-bloom and final composer passes into one truthful frame diagnostic.
    this.webgl.info.autoReset = false;
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFSoftShadowMap;
    this.webgl.shadowMap.autoUpdate = false;
    this.webgl.setClearColor('#181520');

    this.look = calculateDioramaLook(this.venue);
    this.scene.background = this.look.sky;
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

    this.venueSet = buildVenue(this.venue);
    this.scene.add(this.venueSet.root);
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

    const layoutScore = Math.min(...Object.values(VENUE_LAYOUT_REPORTS).map((report) => report.score));
    const checksPass = SCENE_PROPORTION_REPORT.valid && Object.values(VENUE_LAYOUT_REPORTS).every((report) => report.valid)
      && APPEARANCE_LIBRARY_REPORT.valid && DIORAMA_SCALE_REPORT.valid;
    canvas.dataset.proportionCheck = checksPass ? 'pass' : 'warning';
    canvas.dataset.layoutScore = String(Math.min(SCENE_PROPORTION_REPORT.score, layoutScore, DIORAMA_SCALE_REPORT.score));
    canvas.dataset.dioramaScaleCheck = DIORAMA_SCALE_REPORT.valid ? 'pass' : 'warning';
    canvas.dataset.scaleModel = `${SCENE_PROPORTIONS.character.standingHeight}px-adult`;
    canvas.dataset.characterVariation = `${APPEARANCE_LIBRARY_REPORT.uniqueSilhouettes}-silhouettes`;
    canvas.dataset.characterDiversity = String(APPEARANCE_LIBRARY_REPORT.score);
    canvas.dataset.renderer = 'webgl-diorama';
    canvas.dataset.depthModel = 'physical-2.5d';
    canvas.dataset.renderQuality = `webgl-diorama-${qualityTier}`;
    canvas.dataset.masterResolution = '2304x1296';
    canvas.dataset.characterRasterHeight = String(DIORAMA.spriteHeight);
    canvas.dataset.characterDetail = `${DIORAMA.spriteWidth}x${DIORAMA.spriteHeight}-original-pixel-sprite`;
    canvas.dataset.navigation = 'collision-aware';
    canvas.dataset.navigationStatus = 'clear';
    canvas.dataset.navigationBlocked = '0';
    canvas.dataset.navigationReplans = '0';
    canvas.dataset.navigationRecoveries = '0';
    canvas.dataset.navigationDeadlocks = '0';
    canvas.dataset.navigationMaxBlocked = '0.00';
    canvas.dataset.livingDirection = 'idle';
    canvas.dataset.livingRoute = 'none';
    canvas.dataset.livingCompleted = '0';
    canvas.dataset.optics = 'hd-2d-diorama';
    canvas.dataset.speechLanguage = 'symbolic-emotes';
    canvas.dataset.speechBubbleResolution = SPEECH_BUBBLE_RESOLUTION;
    canvas.dataset.renderCount = '0';
    canvas.dataset.visualRenderCount = '0';
    canvas.dataset.reactingCharacter = 'none';
    canvas.dataset.pointerHit = 'none';
    canvas.dataset.reaction = 'none';
    canvas.dataset.cameraFocus = 'none';
    canvas.dataset.cameraFocusSource = 'none';
    canvas.dataset.cameraFocusTarget = 'none';
    canvas.dataset.cameraFocusFov = '30.00';
    canvas.dataset.cameraFocusAmount = '0.00';
    canvas.dataset.cameraPhase = 'overview';
    canvas.dataset.focusParticipants = 'none';
    canvas.dataset.focusOccluders = 'none';
    canvas.dataset.focusOccluderOpacity = '1.00';
    canvas.dataset.visualProfile = this.venue;
    canvas.dataset.surfaceTextures = String(this.venueSet.surfaceTextureCount);
    canvas.dataset.focusBounds = 'none';
    canvas.dataset.focusSafe = 'true';
    canvas.dataset.focusLight = 'off';
    canvas.dataset.visibleEmotes = 'none';
    canvas.dataset.emoteBubbles = '0';
    canvas.dataset.bloomSurfaces = String(this.venueSet.bloomSurfaceCount);
    canvas.dataset.characterBloom = 'excluded';
    canvas.dataset.weatherLayers = '1-batched';
    canvas.dataset.shotBeat = 'overview';
    canvas.dataset.cameraSequence = 'none';
    canvas.dataset.cameraSequenceProgress = '0.000';
    canvas.dataset.artAssets = 'loading';
    canvas.dataset.artPack = 'procedural';
    canvas.dataset.atmosphereWave = 'none';
    canvas.dataset.atmospherePhase = 'idle';
    canvas.dataset.atmosphereZone = 'none';
    canvas.dataset.atmosphereIntensity = '0.000';
    canvas.dataset.atmosphereSeed = '0';
    canvas.dataset.atmosphereAssets = 'loading';
    canvas.dataset.drawCalls = '0';
    canvas.dataset.renderCpuP95 = '0.00';
    canvas.dataset.gpuP95 = 'unavailable';
    canvas.dataset.triangles = '0';
    canvas.dataset.geometries = '0';
    canvas.dataset.gpuTextures = '0';
    canvas.dataset.estimatedTextureBytes = '0';
    canvas.dataset.characterCache = '0';
    canvas.dataset.qualityReason = 'initial-device-profile';
    canvas.dataset.staticBatches = String(this.venueSet.batchedResources.batchCount);
    canvas.dataset.staticInstances = String(this.venueSet.batchedResources.primitiveCount);
    canvas.dataset.v3GeometryBaseline = String(this.venueSet.batchedResources.v3GeometryBaseline);
    canvas.dataset.renderTargets = String(this.pipeline.renderTargetCount);
    canvas.dataset.textureBytes = '0';
    this.applyLayoutDatasets(this.venue);
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
    this.canvas.dataset.pointerHit = targetId ?? 'none';
  }

  clearPointerSample(): void {
    this.pointerSample = undefined;
    this.pointerReactions.clearPointer();
    this.canvas.dataset.pointerHit = 'none';
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
    this.canvas.dataset.textureBytes = String((this.artPack?.textureBytes ?? 0) + (this.atmospherePack?.textureBytes ?? 0));
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
        this.atmosphereDecorHandoffs.length = 0;
        if (venue === 'ramen') {
          for (const name of ['art-detail:prop-primary', 'art-instanced-props:ramen']) {
            const object = this.artDecoration.root.getObjectByName(name);
            if (object) this.atmosphereDecorHandoffs.push(object);
          }
        }
        this.artPack = pack;
        this.spriteTextures.setCharacterAtlas(pack);
        for (const node of this.guestNodes.values()) node.textureName = '';
        this.baristaNode.textureName = '';
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
    this.spriteTextures.setCharacterAtlas(undefined);
    this.canvas.dataset.characterCache = String(this.spriteTextures.cacheStats.textures);
    this.canvas.dataset.textureCache = String(this.spriteTextures.cacheStats.textures);
    for (const node of this.guestNodes.values()) node.textureName = '';
    this.baristaNode.textureName = '';
    this.artDecoration?.dispose();
    this.artDecoration = undefined;
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
      this.canvas.dataset.textureBytes = String((this.artPack?.textureBytes ?? 0) + pack.textureBytes);
    });
  }

  private releaseAtmosphereArt(): void {
    this.atmosphereLayer.setAssets(undefined);
    this.atmospherePack?.dispose();
    this.atmospherePack = undefined;
    this.canvas.dataset.atmosphereAssets = 'procedural';
    this.canvas.dataset.textureBytes = String(this.artPack?.textureBytes ?? 0);
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
      this.venueSet = buildVenue(venue);
      this.scene.add(this.venueSet.root);
      this.atmosphereLayer.setVenue(venue);
      for (const node of this.guestNodes.values()) node.textureName = '';
      this.baristaNode.textureName = '';
      this.requestVenueArt(venue);
      this.requestAtmosphereArt(venue);
    }
    this.look = calculateDioramaLook(this.venue, this.environment);
    const profile = VENUE_VISUAL_PROFILES[venue];
    this.applyCharacterRimColor();
    this.canvas.dataset.venue = venue;
    this.canvas.dataset.visualProfile = profile.id;
    this.canvas.dataset.surfaceTextures = String(this.venueSet.surfaceTextureCount);
    this.canvas.dataset.bloomSurfaces = String(this.venueSet.bloomSurfaceCount);
    this.canvas.dataset.staticBatches = String(this.venueSet.batchedResources.batchCount);
    this.canvas.dataset.staticInstances = String(this.venueSet.batchedResources.primitiveCount);
    this.canvas.dataset.v3GeometryBaseline = String(this.venueSet.batchedResources.v3GeometryBaseline);
    this.applyLayoutDatasets(venue);
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.environment = snapshot;
    this.look = calculateDioramaLook(this.venue, snapshot);
    this.canvas.dataset.dayPhase = snapshot.dayPhase;
    this.canvas.dataset.weather = snapshot.weather.kind;
    this.canvas.dataset.weatherSource = snapshot.weatherSource;
    this.canvas.dataset.localTime = snapshot.localTimeText;
    this.canvas.dataset.locationState = snapshot.locationState;
    this.canvas.dataset.crowdTarget = String(snapshot.targetCrowd);
  }

  setAtmosphere(snapshot: AtmosphereSnapshot): void {
    this.atmosphere = snapshot;
    this.canvas.dataset.atmosphereWave = snapshot.wave;
    this.canvas.dataset.atmospherePhase = snapshot.phase;
    this.canvas.dataset.atmosphereZone = snapshot.zone;
    this.canvas.dataset.atmosphereIntensity = snapshot.intensity.toFixed(3);
    this.canvas.dataset.atmosphereSeed = String(snapshot.seed);
  }

  resize(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    const mobile = window.innerWidth < 700;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.sceneWidth = mobile
      ? Math.max(112, Math.min(210, Math.round(WORLD_HEIGHT * aspect)))
      : WORLD_WIDTH;
    const width = this.sceneWidth * this.qualityProfile.renderScale;
    const height = WORLD_HEIGHT * this.qualityProfile.renderScale;
    this.webgl.setSize(width, height, false);
    this.pipeline.resize(width, height);
    this.canvas.dataset.bloomResolution = this.pipeline.bloomResolution;
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.canvas.dataset.logicalWidth = String(width);
    this.canvas.dataset.sceneWidth = String(this.sceneWidth);
    this.canvas.dataset.renderScale = String(this.qualityProfile.renderScale);
    this.canvas.dataset.particles = reducedMotion ? 'low' : 'full';
    this.camera.configure(this.sceneWidth, mobile, reducedMotion);
    this.canvas.dataset.cameraMode = this.camera.mode;
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
    if (drawVisualFrame) this.webgl.info.reset();
    const time = this.active ? elapsed : 0;
    this.applyLook(time);
    this.updatePointerReaction(snapshot, time);
    const dialogue = this.active ? calculateDialogue(snapshot, time, this.venue, this.reducedMotion, this.activeReaction) : [];
    this.updateFocus(snapshot, time, dialogue);
    this.updateCamera();
    this.updateVenue(time);
    this.updateDoor(snapshot.guests, snapshot.venue);
    this.updateCharacters(snapshot, time, dialogue);
    this.updateFocusEffects(snapshot);
    this.updateFocusFrame(snapshot);
    this.updateWeather(time);
    this.atmosphereLayer.update(this.atmosphere, this.qualityTier, time);
    for (const object of this.atmosphereDecorHandoffs) object.visible = this.atmosphere.intensity <= 0.004;
    this.updateEvent(snapshot, time);
    if (drawVisualFrame) {
      this.gpuTimer.begin();
      this.pipeline.render(this.scene, this.perspective);
      this.gpuTimer.end();
      gpuMs ??= this.gpuTimer.poll();
      this.visualRenderCount += 1;
      this.canvas.dataset.visualRenderCount = String(this.visualRenderCount);
    }
    this.renderCount += 1;
    this.canvas.dataset.renderCount = String(this.renderCount);
    this.canvas.dataset.textureBytes = String((this.artPack?.textureBytes ?? 0) + (this.atmospherePack?.textureBytes ?? 0));
    const cache = this.spriteTextures.cacheStats;
    const metrics: RendererFrameMetrics = {
      cpuMs: Math.max(0, performance.now() - cpuStart),
      ...(gpuMs === undefined ? {} : { gpuMs }),
      drawCalls: this.webgl.info.render.calls,
      triangles: this.webgl.info.render.triangles,
      geometries: this.webgl.info.memory.geometries,
      textures: this.webgl.info.memory.textures,
      estimatedTextureBytes: this.estimateTextureBytes(cache.rawPixelBytes),
      characterCacheSize: cache.textures,
      renderTargets: this.pipeline.renderTargetCount,
    };
    this.publishFrameMetrics(metrics);
    this.updateDatasets(snapshot);
    return metrics;
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
    this.venueSet.dispose();
    this.spriteTextures.dispose();
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
    this.scene.background = this.look.sky;
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(this.look.sky);
      this.scene.fog.density = 0.006 + this.look.fog * 0.038;
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
    for (const material of this.venueSet.exteriorMaterials) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.02 + this.look.night * 0.08;
    }
    const atmosphereCue = atmosphereLightCue(this.atmosphere, time);
    this.atmosphereTint.set(atmosphereCue.tint);
    this.keyLight.color.lerp(this.atmosphereTint, Math.min(0.72, atmosphereCue.key * 0.34 + atmosphereCue.flash * 0.35));
    this.keyLight.intensity += atmosphereCue.key;
    this.hemisphere.intensity += atmosphereCue.ambient;
    for (const light of this.venueSet.practicalLights) light.intensity += atmosphereCue.practical;
    for (const material of this.venueSet.exteriorMaterials) material.emissiveIntensity += atmosphereCue.exterior;
    this.baristaNode.plane.material.emissiveIntensity = this.look.characterEmissive;
    for (const node of this.guestNodes.values()) node.plane.material.emissiveIntensity = this.look.characterEmissive;
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
    this.canvas.dataset.qualityTier = profile.tier;
    this.canvas.dataset.renderScale = String(profile.renderScale);
    this.canvas.dataset.renderQuality = `webgl-diorama-${profile.tier}`;
    this.canvas.dataset.shadowMapSize = String(profile.shadowMapSize);
    this.canvas.dataset.bloomPass = profile.bloom;
    this.canvas.dataset.selectiveBloom = profile.bloom === 'off'
      ? 'fallback-off'
      : profile.tier === 'master' ? 'half-res-registered' : 'quarter-res-registered';
    this.canvas.dataset.bloomResolution = this.pipeline.bloomResolution;
    this.canvas.dataset.miniatureBlur = profile.miniatureBlur;
    this.canvas.dataset.characterFrameRate = String(profile.characterFrameRate);
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
      return (spot?.focusHeight ?? DIORAMA.seatedHeight) + (spot?.pose === 'standing' ? 0.1 : 0.48);
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
    const mobileStatic = this.sceneWidth < WORLD_WIDTH && this.reducedMotion;
    const venueOffset = mobileStatic
      ? this.venue === 'cafe' ? -1.4 : this.venue === 'ramen' ? -3.1 : 4.5
      : 0;
    const overviewX = cameraPanForWorldX(worldCenter) - DIORAMA.width / 2 + venueOffset;
    const targetY = mobileStatic
      ? this.venue === 'cafe' ? 2.3 : this.venue === 'ramen' ? 1.8 : 1.45
      : this.venue === 'arcade' ? 1.9 : 2.55;
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
    const framedFov = this.focusState.active && this.focusState.amount > 0.7
      ? Math.min(30, transform.fieldOfView + this.focusFovLift)
      : transform.fieldOfView;
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
    const entrance = VENUE_LAYOUTS[venue].entrance;
    const active = guests.some((guest) => (
      (guest.state === 'entering' || guest.state === 'exiting' || guest.state === 'walking-to-exit')
      && Math.hypot(guest.position.x - entrance.x, guest.position.y - entrance.y) < 48
    ));
    const target = active ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * (this.reducedMotion ? 1 : 0.09);
    const closedRotation = Number(this.venueSet.doorPivot.userData.closedRotation ?? 0);
    const direction = venue === 'ramen' ? -1 : 1;
    this.venueSet.doorPivot.rotation.y = closedRotation + this.doorOpen * 1.18 * direction;
  }

  private updateCharacters(snapshot: SceneSnapshot, time: number, dialogue: readonly DialogueLine[]): void {
    this.spriteTextures.beginFrame();
    const placements = this.resolveDialoguePlacements(snapshot, dialogue);
    const lines = new Map(dialogue.map((line) => [line.speakerId, line]));
    this.visibleDialogue = dialogue.filter((line) => placements.get(line.speakerId)?.visible !== false);
    this.activeSpeechBubbles = this.visibleDialogue.length;
    const visibleIds = new Set(snapshot.guests.map((guest) => guest.id));
    for (const [id, node] of this.guestNodes) {
      if (visibleIds.has(id)) continue;
      node.root.removeFromParent();
      this.disposeCharacterNode(node);
      this.spriteTextures.releaseCharacter(id);
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
      });
      this.updateGuestNode(node, guest, visual, lines.get(guest.id), placements.get(guest.id));
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
    this.spriteTextures.endFrame();
  }

  private updateGuestNode(
    node: CharacterNode,
    guest: Guest,
    visual: CharacterVisualState,
    dialogue?: DialogueLine,
    placement?: Readonly<SpeechBubblePlacement>,
  ): void {
    const point = worldToCharacterDiorama(guest.position);
    const seated = visual.seated;
    node.root.position.set(point.x + visual.offsetX, 0.07 + visual.offsetY, point.z);
    this.applySprite(node, this.spriteTextures.forGuest(guest, this.venue, visual), seated, visual.facing);
    node.plane.rotation.copy(this.perspective.rotation);
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : guest.facing > 0;
    node.speech.update(
      dialogue,
      this.venue,
      tailLeft,
      seated ? DIORAMA.seatedHeight : DIORAMA.standingHeight,
      placement,
    );
    node.shadow.scale.set(seated ? 0.92 : 0.72, seated ? 1.3 : 1, 1);
    node.shadow.material.opacity = 0.22 + this.look.daylight * 0.09;
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
    node.root.position.set(point.x + visual.offsetX, 0.07 + visual.offsetY, point.z);
    this.applySprite(node, this.spriteTextures.forBarista(barista, this.venue, visual), false, visual.facing);
    node.plane.rotation.copy(this.perspective.rotation);
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : barista.facing > 0;
    node.speech.update(dialogue, this.venue, tailLeft, DIORAMA.standingHeight, placement);
    node.root.rotation.y = 0;
  }

  private resolveDialoguePlacements(
    snapshot: SceneSnapshot,
    dialogue: readonly DialogueLine[],
  ): ReadonlyMap<string, SpeechBubblePlacement> {
    if (dialogue.length < 2) return new Map(dialogue.map((line) => [line.speakerId, {
      visible: true, offsetX: 0, offsetY: 0,
    }]));
    this.perspective.updateMatrixWorld(true);
    const bounds = dialogue
      .map((line) => this.projectBubbleBounds(line, snapshot))
      .filter((entry): entry is BubbleBounds => entry !== undefined);
    const projected = new Map(bounds.map((entry) => [entry.speakerId, entry]));
    const placements = resolveBubblePlacements(bounds);
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
    const point = worldToCharacterDiorama(participant.position);
    const characterHeight = guest?.state === 'activity' ? DIORAMA.seatedHeight : DIORAMA.standingHeight;
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

  private applySprite(node: CharacterNode, texture: Texture, seated: boolean, facing: -1 | 1): void {
    if (node.textureName !== texture.name) {
      node.plane.material.map = texture;
      node.plane.material.emissiveMap = texture;
      node.plane.material.needsUpdate = true;
      node.textureName = texture.name;
    }
    const height = seated ? DIORAMA.seatedHeight : DIORAMA.standingHeight;
    const width = height * (DIORAMA.spriteWidth / DIORAMA.spriteHeight);
    node.plane.scale.set(width * facing, height, 1);
    node.plane.position.y = height / 2;
  }

  private updateFocusEffects(snapshot: SceneSnapshot): void {
    const activeIds = new Set(this.focusState.participantIds);
    if (!this.focusState.active || activeIds.size === 0) {
      this.restoreFocusEffects();
      return;
    }

    const participantLift = this.look.characterEmissive * 1.1;
    for (const id of activeIds) {
      if (id === 'barista') this.baristaNode.plane.material.emissiveIntensity = participantLift;
      else {
        const node = this.guestNodes.get(id);
        if (node) node.plane.material.emissiveIntensity = participantLift;
      }
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
      const height = guest?.state === 'activity' ? (spot?.focusHeight ?? DIORAMA.seatedHeight) : DIORAMA.standingHeight;
      targets.push({
        id,
        position: node.root.position,
        height,
        width: height * (DIORAMA.spriteWidth / DIORAMA.spriteHeight),
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
    this.baristaNode.plane.material.emissiveIntensity = this.look.characterEmissive;
    for (const node of this.guestNodes.values()) node.plane.material.emissiveIntensity = this.look.characterEmissive;
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
    const aspect = DIORAMA.spriteWidth / DIORAMA.spriteHeight;
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
      const height = seated ? DIORAMA.seatedHeight : DIORAMA.standingHeight;
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
      const count = this.reducedMotion ? Math.min(54, Math.round(masterCount * qualityScale)) : Math.round(masterCount * qualityScale);
      layer.geometry.setDrawRange(0, count);
      if (this.reducedMotion) continue;
      for (let index = 0; index < count; index += 1) {
        const depthBand = index % 3;
        const seedIndex = index + depthBand * 97;
        const base = seeded(seedIndex, 3);
        const speed = weather === 'snow' ? 0.3 + seeded(seedIndex, 4) * 0.18 : 1.1 + depthBand * 0.28 + seeded(seedIndex, 4) * 0.65;
        const y = ((base * 8.5 - time * speed) % 8.5 + 8.5) % 8.5 + 0.4;
        positions.setY(index, y);
        if (weather === 'snow') positions.setX(index, -7.7 + seeded(seedIndex, 1) * 15.4 + Math.sin(time + seedIndex) * 0.12);
      }
      positions.needsUpdate = true;
    }
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

  private applyLayoutDatasets(venue: VenueKind): void {
    const layout = VENUE_LAYOUTS[venue];
    const seatReport = validateSeatAlignment(layout, this.venueSet.seatBindings);
    this.canvas.dataset.venueLayout = layout.venue;
    this.canvas.dataset.entryFlow = layout.entryFlow;
    this.canvas.dataset.layoutCapacity = `${layout.population.min}-${layout.population.max}`;
    this.canvas.dataset.layoutCheck = VENUE_LAYOUT_REPORTS[venue].valid ? 'pass' : 'warning';
    this.canvas.dataset.seatAlignment = seatReport.valid ? 'pass' : 'warning';
    this.canvas.dataset.seatBindings = String(seatReport.bindingCount);
    this.canvas.dataset.activitySpots = layout.activitySpots
      .map((spot) => `${spot.id}:${spot.kind}:${spot.pose}`)
      .join('|');
    this.canvas.dataset.passingPlaces = layout.passingPlaces.map((place) => place.id).join('|');
    this.canvas.dataset.livingRoutes = LIVING_ROUTES_BY_VENUE[venue].map((route) => route.id).join('|');
    this.canvas.dataset.goldenLivingSequence = GOLDEN_LIVING_SEQUENCES[venue];
  }

  private estimateTextureBytes(characterCacheBytes: number): number {
    const textures = new Map<string, Texture>();
    this.scene.traverse((entry) => {
      if (!(entry instanceof Mesh)) return;
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      for (const material of materials) {
        const values = material as unknown as Record<string, unknown>;
        for (const key of ['map', 'emissiveMap', 'roughnessMap', 'bumpMap', 'alphaMap']) {
          const texture = values[key];
          if (texture instanceof Texture && !texture.name.startsWith('character:')) textures.set(texture.uuid, texture);
        }
      }
    });
    let sceneTextureBytes = 0;
    for (const texture of textures.values()) {
      const source = texture.source.data as { width?: unknown; height?: unknown } | undefined;
      const image = texture.image as { width?: unknown; height?: unknown } | undefined;
      const width = typeof source?.width === 'number' ? source.width : typeof image?.width === 'number' ? image.width : 0;
      const height = typeof source?.height === 'number' ? source.height : typeof image?.height === 'number' ? image.height : 0;
      sceneTextureBytes += Math.max(0, width * height * 4);
    }
    const shadowMapBytes = this.qualityProfile.shadowMapSize ** 2 * 4;
    return characterCacheBytes
      + Math.max(sceneTextureBytes, this.venueSet.surfaceTextureBytes)
      + this.pipeline.estimatedTextureBytes
      + shadowMapBytes;
  }

  private publishFrameMetrics(metrics: RendererFrameMetrics): void {
    this.canvas.dataset.drawCalls = String(metrics.drawCalls);
    this.canvas.dataset.renderCpu = metrics.cpuMs.toFixed(2);
    if (metrics.gpuMs !== undefined) this.canvas.dataset.gpu = metrics.gpuMs.toFixed(2);
    this.canvas.dataset.triangles = String(metrics.triangles);
    this.canvas.dataset.geometries = String(metrics.geometries);
    this.canvas.dataset.gpuTextures = String(metrics.textures);
    this.canvas.dataset.estimatedTextureBytes = String(metrics.estimatedTextureBytes);
    this.canvas.dataset.characterCache = String(metrics.characterCacheSize);
    this.canvas.dataset.renderTargets = String(metrics.renderTargets);
  }

  private updateDatasets(snapshot: SceneSnapshot): void {
    const { accident, moment } = snapshot;
    this.canvas.dataset.cameraX = this.camera.x.toFixed(1);
    this.canvas.dataset.guestCount = String(snapshot.guests.length);
    this.canvas.dataset.accident = accident?.kind ?? 'none';
    this.canvas.dataset.accidentPhase = accident?.phase ?? 'none';
    this.canvas.dataset.moment = moment?.kind ?? 'none';
    this.canvas.dataset.momentPhase = moment?.phase ?? 'none';
    this.canvas.dataset.sessionAct = snapshot.sessionAct ?? 'arrival';
    this.canvas.dataset.navigationStatus = snapshot.navigation.staticClear && snapshot.navigation.deadlocks === 0
      ? 'clear'
      : 'warning';
    this.canvas.dataset.navigationMoving = String(snapshot.navigation.movingGuests);
    this.canvas.dataset.navigationYielding = String(snapshot.navigation.yieldingGuests);
    this.canvas.dataset.navigationBlocked = String(snapshot.navigation.blockedGuests);
    this.canvas.dataset.navigationReplans = String(snapshot.navigation.replans);
    this.canvas.dataset.navigationRecoveries = String(snapshot.navigation.recoveries);
    this.canvas.dataset.navigationDeadlocks = String(snapshot.navigation.deadlocks);
    this.canvas.dataset.navigationMaxBlocked = snapshot.navigation.maxBlockedSeconds.toFixed(2);
    this.canvas.dataset.navigationMinimumDistance = snapshot.navigation.minimumGuestDistance.toFixed(2);
    this.canvas.dataset.livingDirection = snapshot.livingDirection.activeRoutes.length > 0 ? 'active' : 'idle';
    this.canvas.dataset.livingRoute = snapshot.livingDirection.activeRoutes.join(',') || 'none';
    this.canvas.dataset.livingCompleted = String(snapshot.livingDirection.completedSequences);
    this.canvas.dataset.cameraPhase = this.focusState.phase;
    this.canvas.dataset.shotBeat = this.focusState.shotBeat;
    this.canvas.dataset.cameraSequence = this.focusState.sequenceId;
    this.canvas.dataset.cameraSequenceProgress = this.focusState.sequenceProgress.toFixed(3);
    this.canvas.dataset.story = moment?.story ?? 'none';
    this.canvas.dataset.storyStep = String(moment?.storyStep ?? 0);
    this.canvas.dataset.regulars = snapshot.regularIds.join(',');
    this.canvas.dataset.venue = snapshot.venue;
    this.canvas.dataset.lighting = this.look.night > 0.5 ? 'lamplit' : this.look.daylight > 0.45 ? 'daylight' : 'soft';
    this.canvas.dataset.material = this.look.wetness > 0.12 ? 'wet' : this.look.fog > 0.15 ? 'misty' : 'dry';
    this.canvas.dataset.venueActivity = snapshot.barista.task;
    const layout = VENUE_LAYOUTS[snapshot.venue];
    const occupied = snapshot.guests.filter((guest) => guest.state === 'activity' && guest.activitySpotId);
    this.canvas.dataset.occupiedSpots = occupied.map((guest) => guest.activitySpotId).join(',') || 'none';
    this.canvas.dataset.occupiedTables = String(occupied.filter((guest) => {
      const kind = activitySpotById(layout, guest.activitySpotId)?.kind;
      return kind === 'table' || kind === 'bench' || kind === 'counter-stool';
    }).length);
    this.canvas.dataset.door = this.doorOpen > 0.03 ? 'opening' : 'closed';
    this.canvas.dataset.doorOpen = this.doorOpen.toFixed(2);
    this.canvas.dataset.bloom = this.look.bloom.toFixed(2);
    this.canvas.dataset.exposure = this.look.exposure.toFixed(2);
    this.canvas.dataset.characterEmissive = this.look.characterEmissive.toFixed(2);
    this.canvas.dataset.shadowLift = this.look.shadowLift.toFixed(2);
    this.canvas.dataset.saturation = this.look.saturation.toFixed(2);
    this.canvas.dataset.clock = 'analog';
    this.canvas.dataset.clockTime = this.environment?.localTimeText ?? '00:00';
    this.canvas.dataset.speechBubbles = String(this.activeSpeechBubbles);
    this.canvas.dataset.emoteBubbles = String(this.activeSpeechBubbles);
    this.canvas.dataset.reactingCharacter = this.activeReaction?.characterId ?? 'none';
    this.canvas.dataset.reaction = this.activeReaction?.gesture ?? 'none';
    this.canvas.dataset.cameraFocus = this.focusState.active ? 'active' : 'none';
    this.canvas.dataset.cameraFocusSource = this.focusState.source ?? 'none';
    this.canvas.dataset.cameraFocusTarget = this.focusState.target
      ? `${this.focusState.target.x.toFixed(1)},${this.focusState.target.y.toFixed(1)},${(this.focusState.targetHeight ?? 0).toFixed(2)}`
      : 'none';
    this.canvas.dataset.cameraFocusFov = this.perspective.fov.toFixed(2);
    this.canvas.dataset.cameraFocusAmount = this.focusState.amount.toFixed(2);
    this.canvas.dataset.focusParticipants = this.focusState.participantIds.join(',') || 'none';
    this.canvas.dataset.focusOccluders = this.activeFocusOccluders.map((occluder) => occluder.id).join(',') || 'none';
    this.canvas.dataset.focusOccluderOpacity = this.activeFocusOccluders.length > 0
      ? focusOccluderOpacity(this.focusState.amount).toFixed(2)
      : '1.00';
    this.canvas.dataset.focusBounds = this.focusFrameBounds
      ? [this.focusFrameBounds.left, this.focusFrameBounds.top, this.focusFrameBounds.right, this.focusFrameBounds.bottom]
        .map((value) => value.toFixed(3)).join(',')
      : 'none';
    this.canvas.dataset.focusSafe = String(this.focusFrameSafe);
    this.canvas.dataset.focusLight = this.focusLight.intensity > 0.01 ? this.focusLight.intensity.toFixed(2) : 'off';
    this.canvas.dataset.visibleEmotes = this.visibleDialogue
      .map((line) => `${line.speakerId}:${line.visibleEmotes.join('+')}`)
      .join('|') || 'none';
    this.canvas.dataset.mobileTourPaused = String(this.camera.mode === 'tour' && this.focusState.active);
    this.canvas.dataset.characterFrameRate = String(this.qualityProfile.characterFrameRate);
    this.canvas.dataset.reactionTargets = this.reactionTargets
      .map((target) => `${target.id}:${Math.round(target.x)},${Math.round(target.y)}`)
      .join('|');
    this.canvas.dataset.textureCache = String(this.spriteTextures.cacheSize);
    this.canvas.dataset.inactiveTextures = '0';
  }

  private createCharacterNode(name: string): CharacterNode {
    const root = new Group();
    root.name = `character:${name}`;
    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshStandardMaterial({
      color: '#ffffff', transparent: true, alphaTest: 0.04, depthWrite: true,
      emissive: VENUE_VISUAL_PROFILES[this.venue].lights.characterRim,
      emissiveIntensity: this.look.characterEmissive,
      roughness: 0.82, metalness: 0, side: DoubleSide,
    });
    const plane = new Mesh(geometry, material);
    plane.name = `${root.name}:sprite`;
    plane.castShadow = false;
    root.add(plane);
    const shadowGeometry = new CircleGeometry(0.62, 24);
    const shadowMaterial = new MeshBasicMaterial({ color: '#130f18', transparent: true, opacity: 0.28, depthWrite: false });
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    root.add(shadow);
    const speech = new SpeechBubble(name);
    root.add(speech.mesh);
    return { root, plane, shadow, speech, textureName: '' };
  }

  private applyCharacterRimColor(): void {
    const color = new Color(VENUE_VISUAL_PROFILES[this.venue].lights.characterRim);
    this.baristaNode.plane.material.emissive.copy(color);
    for (const node of this.guestNodes.values()) node.plane.material.emissive.copy(color);
  }

  private disposeCharacterNode(node: CharacterNode): void {
    node.plane.geometry.dispose();
    node.plane.material.dispose();
    node.shadow.geometry.dispose();
    node.shadow.material.dispose();
    node.speech.dispose();
  }

  private createWeatherParticles(): Points<BufferGeometry, PointsMaterial> {
    const count = 270;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const depthBand = index % 3;
      const seedIndex = index + depthBand * 97;
      positions[index * 3] = -7.7 + seeded(seedIndex, 1) * 15.4;
      positions[index * 3 + 1] = 0.3 + seeded(seedIndex, 2) * 8.5;
      positions[index * 3 + 2] = -3.43 + depthBand * 0.07 + seeded(seedIndex, 5) * 0.025;
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
