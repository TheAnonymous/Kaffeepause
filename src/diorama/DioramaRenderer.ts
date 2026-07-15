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
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import {
  VENUE_LAYOUTS,
  VENUE_LAYOUT_REPORTS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  activitySpotById,
} from '../simulation/layout';
import type { Barista, Guest } from '../simulation/types';
import type { SceneSnapshot } from '../scene/types';
import type { VenueKind } from '../venue';
import { APPEARANCE_LIBRARY_REPORT } from '../simulation/appearance';
import { SCENE_PROPORTION_REPORT, SCENE_PROPORTIONS } from '../scene/proportions';
import {
  RENDER_QUALITY_PROFILES,
  type RenderQualityProfile,
  type RenderQualityTier,
} from '../scene/renderQuality';
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
  type ActivePointerReaction,
  type PointerSample,
  type ReactionTarget,
} from './pointerReaction';
import {
  CameraFocusDirector,
  focusFieldOfView,
  participantMidpoint,
  type CameraFocusCandidate,
  type CameraFocusState,
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
  worldToDiorama,
  type DioramaSet,
  type FocusOccluder,
} from './types';
import { buildVenue } from './venueBuilder';

interface CharacterNode {
  readonly root: Group;
  readonly plane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly speech: SpeechBubble;
  textureName: string;
}

const MINIATURE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(2304, 1296) },
    focusBand: { value: 0.57 },
    blurStrength: { value: 0.0016 },
    vignette: { value: 0.22 },
    warmth: { value: 0.05 },
    saturation: { value: 1.08 },
    shadowLift: { value: 0.03 },
    time: { value: 0 },
    simplifiedBlur: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float focusBand;
    uniform float blurStrength;
    uniform float vignette;
    uniform float warmth;
    uniform float saturation;
    uniform float shadowLift;
    uniform float time;
    uniform float simplifiedBlur;
    varying vec2 vUv;

    void main() {
      float distanceFromFocus = abs(vUv.y - focusBand);
      float miniatureBlur = smoothstep(0.18, 0.49, distanceFromFocus);
      vec2 offset = vec2(blurStrength * miniatureBlur, blurStrength * 0.62 * miniatureBlur);
      vec4 color;
      if (simplifiedBlur > 0.5) {
        color = texture2D(tDiffuse, vUv) * 0.76;
        color += texture2D(tDiffuse, vUv + vec2(offset.x, 0.0)) * 0.12;
        color += texture2D(tDiffuse, vUv - vec2(offset.x, 0.0)) * 0.12;
      } else {
        color = texture2D(tDiffuse, vUv) * 0.32;
        color += texture2D(tDiffuse, vUv + vec2(offset.x, 0.0)) * 0.12;
        color += texture2D(tDiffuse, vUv - vec2(offset.x, 0.0)) * 0.12;
        color += texture2D(tDiffuse, vUv + vec2(0.0, offset.y)) * 0.12;
        color += texture2D(tDiffuse, vUv - vec2(0.0, offset.y)) * 0.12;
        color += texture2D(tDiffuse, vUv + offset) * 0.10;
        color += texture2D(tDiffuse, vUv - offset) * 0.10;
      }
      float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luminance), color.rgb, saturation);
      float saturatedLuminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      float shadowWeight = 1.0 - smoothstep(0.08, 0.58, saturatedLuminance);
      color.rgb += vec3(shadowLift * shadowWeight);
      float edge = smoothstep(0.9, 0.22, distance(vUv, vec2(0.5)));
      color.rgb *= mix(1.0 - vignette, 1.0, edge);
      color.r += warmth * 0.018;
      color.b -= warmth * 0.012;
      // Extremely subtle exposure breathing keeps practical lights from feeling static.
      color.rgb *= 1.0 + sin(time * 0.37) * 0.002;
      gl_FragColor = color;
    }
  `,
} as const;

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 91.73 + salt * 17.17) * 43_758.5453;
  return value - Math.floor(value);
}

export class DioramaRenderer {
  private readonly webgl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(30, 16 / 9, 0.1, 80);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly miniature: ShaderPass;
  private readonly hemisphere = new HemisphereLight('#bad7df', '#2a2028', 1.1);
  private readonly keyLight = new DirectionalLight('#fff0cc', 3.1);
  private readonly spriteTextures = new SpriteTextureLibrary();
  private readonly guestNodes = new Map<string, CharacterNode>();
  private readonly baristaNode: CharacterNode;
  private readonly rain: Points<BufferGeometry, PointsMaterial>;
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
  private focusState: CameraFocusState = { active: false, participantIds: [], amount: 0, fieldOfView: 30 };
  private activeFocusOccluders: readonly FocusOccluder[] = [];
  private visibleDialogue: readonly DialogueLine[] = [];
  private qualityTier: RenderQualityTier;
  private qualityProfile: RenderQualityProfile;
  private renderCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CafeCamera,
    qualityTier: RenderQualityTier = 'master',
  ) {
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
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFSoftShadowMap;
    this.webgl.setClearColor('#181520');

    this.look = calculateDioramaLook(this.venue);
    this.scene.background = this.look.sky;
    this.scene.fog = new FogExp2(this.look.sky, 0.018);
    this.scene.add(this.hemisphere, this.keyLight);
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
    this.baristaNode = this.createCharacterNode('barista');
    this.scene.add(this.baristaNode.root);
    this.rain = this.createWeatherParticles();
    this.scene.add(this.rain);
    this.eventAccent = this.createEventAccent();
    this.scene.add(this.eventAccent);

    this.perspective.position.set(0, 6.7, 15.8);
    this.perspective.lookAt(0, 2.55, -0.2);
    const renderPass = new RenderPass(this.scene, this.perspective);
    this.bloom = new UnrealBloomPass(new Vector2(2304, 1296), this.look.bloom, 0.54, 0.78);
    this.miniature = new ShaderPass(MINIATURE_SHADER);
    this.composer = new EffectComposer(this.webgl);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.miniature);
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
    canvas.dataset.optics = 'hd-2d-diorama';
    canvas.dataset.speechLanguage = 'symbolic-emotes';
    canvas.dataset.speechBubbleResolution = SPEECH_BUBBLE_RESOLUTION;
    canvas.dataset.renderCount = '0';
    canvas.dataset.reactingCharacter = 'none';
    canvas.dataset.reaction = 'none';
    canvas.dataset.cameraFocus = 'none';
    canvas.dataset.cameraFocusSource = 'none';
    canvas.dataset.cameraFocusTarget = 'none';
    canvas.dataset.cameraFocusFov = '30.00';
    canvas.dataset.focusParticipants = 'none';
    canvas.dataset.focusOccluders = 'none';
    canvas.dataset.focusOccluderOpacity = '1.00';
    canvas.dataset.visibleEmotes = 'none';
    canvas.dataset.emoteBubbles = '0';
    this.applyLayoutDatasets(this.venue);
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setPointerSample(sample: PointerSample): void {
    this.pointerSample = sample;
  }

  clearPointerSample(): void {
    this.pointerSample = undefined;
    this.pointerReactions.clearPointer();
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
      this.venueSet.dispose();
      this.venue = venue;
      this.venueSet = buildVenue(venue);
      this.scene.add(this.venueSet.root);
      for (const node of this.guestNodes.values()) node.textureName = '';
      this.baristaNode.textureName = '';
    }
    this.look = calculateDioramaLook(this.venue, this.environment);
    this.canvas.dataset.venue = venue;
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
    this.composer.setSize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.miniature.uniforms.resolution!.value.set(width, height);
    this.canvas.dataset.logicalWidth = String(width);
    this.canvas.dataset.sceneWidth = String(this.sceneWidth);
    this.canvas.dataset.renderScale = String(this.qualityProfile.renderScale);
    this.canvas.dataset.particles = reducedMotion ? 'low' : 'full';
    this.camera.configure(this.sceneWidth, mobile, reducedMotion);
    this.canvas.dataset.cameraMode = this.camera.mode;
  }

  render(elapsed: number, snapshot: SceneSnapshot): void {
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
    this.updateWeather(time);
    this.updateEvent(snapshot, time);
    this.composer.render();
    this.renderCount += 1;
    this.canvas.dataset.renderCount = String(this.renderCount);
    this.updateDatasets(snapshot);
  }

  dispose(): void {
    this.restoreFocusEffects();
    this.venueSet.dispose();
    this.spriteTextures.dispose();
    for (const node of this.guestNodes.values()) this.disposeCharacterNode(node);
    this.disposeCharacterNode(this.baristaNode);
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.eventAccent.geometry.dispose();
    this.eventAccent.material.dispose();
    this.composer.dispose();
    this.webgl.dispose();
  }

  private applyLook(time: number): void {
    this.scene.background = this.look.sky;
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(this.look.sky);
      this.scene.fog.density = 0.006 + this.look.fog * 0.038;
    }
    this.webgl.toneMappingExposure = this.look.exposure;
    this.hemisphere.color.copy(this.look.ambient);
    this.hemisphere.groundColor.copy(new Color(this.venueSet.theme.floor));
    this.hemisphere.intensity = this.look.ambientIntensity;
    this.keyLight.color.copy(this.look.sun);
    this.keyLight.intensity = this.look.keyIntensity;
    this.keyLight.position.x = this.look.fromRight ? 8 : -8;
    for (const light of this.venueSet.practicalLights) light.intensity = this.look.practicalIntensity;
    for (const pool of this.venueSet.lightPools) pool.material.opacity = this.look.lightPoolOpacity;
    this.venueSet.floorMaterial.roughness = 0.55 - this.look.wetness * 0.2;
    this.venueSet.floorMaterial.metalness = 0.08 + this.look.wetness * 0.14;
    for (const material of this.venueSet.exteriorMaterials) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.02 + this.look.night * 0.08;
    }
    this.baristaNode.plane.material.emissiveIntensity = this.look.characterEmissive;
    for (const node of this.guestNodes.values()) node.plane.material.emissiveIntensity = this.look.characterEmissive;
    this.bloom.strength = this.look.bloom * this.qualityProfile.bloomStrength;
    this.miniature.uniforms.focusBand!.value = this.look.focusBand;
    this.miniature.uniforms.blurStrength!.value = this.look.blur * this.qualityProfile.miniatureBlurStrength;
    this.miniature.uniforms.vignette!.value = this.look.vignette;
    this.miniature.uniforms.warmth!.value = this.venue === 'arcade' ? -0.08 : 0.12 + this.look.night * 0.08;
    this.miniature.uniforms.saturation!.value = this.look.saturation;
    this.miniature.uniforms.shadowLift!.value = this.look.shadowLift;
    this.miniature.uniforms.time!.value = time;
  }

  private applyQualityProfile(): void {
    const profile = this.qualityProfile;
    this.bloom.enabled = profile.bloom !== 'off';
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    this.miniature.uniforms.simplifiedBlur!.value = profile.miniatureBlur === 'simplified' ? 1 : 0;
    this.canvas.dataset.qualityTier = profile.tier;
    this.canvas.dataset.renderScale = String(profile.renderScale);
    this.canvas.dataset.renderQuality = `webgl-diorama-${profile.tier}`;
    this.canvas.dataset.shadowMapSize = String(profile.shadowMapSize);
    this.canvas.dataset.bloomPass = profile.bloom;
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
    const point = worldToDiorama(position);
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
    this.focusState = this.focusDirector.update(time, this.active ? candidates : [], this.reducedMotion);
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
    return {
      source,
      key,
      target: { ...target },
      participantIds,
      targetHeight,
      fieldOfView: focusFieldOfView(positions.length > 0 ? positions : [target]),
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

  private updateCamera(): void {
    const worldCenter = this.camera.x + this.sceneWidth / 2;
    const overviewX = cameraPanForWorldX(worldCenter) - DIORAMA.width / 2;
    const mappedTarget = this.focusState.target ? worldToDiorama(this.focusState.target) : undefined;
    const focusX = mappedTarget?.x ?? overviewX;
    const targetX = overviewX + (focusX - overviewX) * this.focusState.amount;
    this.perspective.position.x = targetX;
    this.perspective.position.y = 6.7 + (5.7 - 6.7) * this.focusState.amount;
    this.perspective.position.z = 15.8 + ((mappedTarget?.z ?? -0.2) + 12.3 - 15.8) * this.focusState.amount;
    if (Math.abs(this.perspective.fov - this.focusState.fieldOfView) > 0.001) {
      this.perspective.fov = this.focusState.fieldOfView;
      this.perspective.updateProjectionMatrix();
    }
    const targetHeight = 2.55 + ((this.focusState.targetHeight ?? 2.55) - 2.55) * this.focusState.amount;
    const targetZ = -0.2 + ((mappedTarget?.z ?? -0.2) + 0.2) * this.focusState.amount;
    this.perspective.lookAt(targetX, targetHeight, targetZ);
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
    const point = worldToDiorama(guest.position);
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
    const point = worldToDiorama(barista.position);
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
    const point = worldToDiorama(participant.position);
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

    const participantLift = Math.min(0.42, this.look.characterEmissive + 0.1);
    for (const id of activeIds) {
      if (id === 'barista') this.baristaNode.plane.material.emissiveIntensity = participantLift;
      else {
        const node = this.guestNodes.get(id);
        if (node) node.plane.material.emissiveIntensity = participantLift;
      }
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
  }

  private updateWeather(time: number): void {
    const weather = this.environment?.weather.kind ?? 'clear';
    const visible = weather === 'rain' || weather === 'storm' || weather === 'snow';
    this.rain.visible = visible;
    if (!visible) return;
    this.rain.material.color.set(weather === 'snow' ? '#e6edf0' : '#8eb3c5');
    this.rain.material.size = weather === 'snow' ? 0.09 : 0.045;
    this.rain.material.opacity = weather === 'storm' ? 0.8 : 0.62;
    const positions = this.rain.geometry.getAttribute('position') as BufferAttribute;
    const count = this.reducedMotion ? 72 : weather === 'storm' ? 260 : 180;
    this.rain.geometry.setDrawRange(0, count);
    if (this.reducedMotion) return;
    for (let index = 0; index < count; index += 1) {
      const base = seeded(index, 3);
      const speed = weather === 'snow' ? 0.33 + seeded(index, 4) * 0.18 : 1.4 + seeded(index, 4) * 0.75;
      const y = ((base * 8.5 - time * speed) % 8.5 + 8.5) % 8.5 + 0.4;
      positions.setY(index, y);
      if (weather === 'snow') positions.setX(index, -7.7 + seeded(index, 1) * 15.4 + Math.sin(time + index) * 0.12);
    }
    positions.needsUpdate = true;
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
    const mapped = worldToDiorama(point);
    this.eventAccent.position.set(mapped.x, 0.12, mapped.z);
    this.eventAccent.material.color.set(accident ? '#ed766b' : this.venueSet.theme.glow);
    this.eventAccent.material.opacity = 0.25 + Math.sin(time * 4) * 0.08;
    const scale = 0.85 + Math.sin(time * 2.7) * 0.08;
    this.eventAccent.scale.setScalar(scale);
  }

  private applyLayoutDatasets(venue: VenueKind): void {
    const layout = VENUE_LAYOUTS[venue];
    this.canvas.dataset.venueLayout = layout.venue;
    this.canvas.dataset.entryFlow = layout.entryFlow;
    this.canvas.dataset.layoutCapacity = `${layout.population.min}-${layout.population.max}`;
    this.canvas.dataset.layoutCheck = VENUE_LAYOUT_REPORTS[venue].valid ? 'pass' : 'warning';
    this.canvas.dataset.activitySpots = layout.activitySpots
      .map((spot) => `${spot.id}:${spot.kind}:${spot.pose}`)
      .join('|');
  }

  private updateDatasets(snapshot: SceneSnapshot): void {
    const { accident, moment } = snapshot;
    this.canvas.dataset.cameraX = this.camera.x.toFixed(1);
    this.canvas.dataset.guestCount = String(snapshot.guests.length);
    this.canvas.dataset.accident = accident?.kind ?? 'none';
    this.canvas.dataset.accidentPhase = accident?.phase ?? 'none';
    this.canvas.dataset.moment = moment?.kind ?? 'none';
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
    this.canvas.dataset.cameraFocusFov = this.focusState.fieldOfView.toFixed(2);
    this.canvas.dataset.focusParticipants = this.focusState.participantIds.join(',') || 'none';
    this.canvas.dataset.focusOccluders = this.activeFocusOccluders.map((occluder) => occluder.id).join(',') || 'none';
    this.canvas.dataset.focusOccluderOpacity = this.activeFocusOccluders.length > 0
      ? focusOccluderOpacity(this.focusState.amount).toFixed(2)
      : '1.00';
    this.canvas.dataset.visibleEmotes = this.visibleDialogue
      .map((line) => `${line.speakerId}:${line.visibleEmotes.join('+')}`)
      .join('|') || 'none';
    this.canvas.dataset.mobileTourPaused = String(this.camera.mode === 'tour' && this.focusState.active);
    this.canvas.dataset.characterFrameRate = String(this.qualityProfile.characterFrameRate);
    this.canvas.dataset.reactionTargets = this.reactionTargets
      .map((target) => `${target.id}:${Math.round(target.x)},${Math.round(target.y)}`)
      .join('|');
    this.canvas.dataset.textureCache = String(this.spriteTextures.cacheSize);
    this.canvas.dataset.inactiveTextures = String(this.spriteTextures.inactiveCacheSize);
  }

  private createCharacterNode(name: string): CharacterNode {
    const root = new Group();
    root.name = `character:${name}`;
    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshStandardMaterial({
      color: '#ffffff', transparent: true, alphaTest: 0.04, depthWrite: true,
      emissive: '#ffffff', emissiveIntensity: this.look.characterEmissive,
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

  private disposeCharacterNode(node: CharacterNode): void {
    node.plane.geometry.dispose();
    node.plane.material.dispose();
    node.shadow.geometry.dispose();
    node.shadow.material.dispose();
    node.speech.dispose();
  }

  private createWeatherParticles(): Points<BufferGeometry, PointsMaterial> {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = -7.7 + seeded(index, 1) * 15.4;
      positions[index * 3 + 1] = 0.3 + seeded(index, 2) * 8.5;
      positions[index * 3 + 2] = -3.28 + seeded(index, 5) * 0.05;
    }
    const geometry = new BufferGeometry();
    const attribute = new BufferAttribute(positions, 3);
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const material = new PointsMaterial({
      color: '#8eb3c5', size: 0.045, transparent: true, opacity: 0.65,
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
