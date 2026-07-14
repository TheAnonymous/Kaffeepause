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
  WebGLRenderer,
  type Texture,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { CafeCamera } from '../camera';
import type { CafeEnvironmentSnapshot } from '../environment/types';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../simulation/layout';
import type { Barista, Guest } from '../simulation/types';
import type { SceneSnapshot } from '../scene/types';
import type { VenueKind } from '../venue';
import { APPEARANCE_LIBRARY_REPORT } from '../simulation/appearance';
import { CAFE_LAYOUT_REPORT } from '../simulation/layout';
import { SCENE_PROPORTION_REPORT, SCENE_PROPORTIONS } from '../scene/proportions';
import {
  RENDER_QUALITY_PROFILES,
  type RenderQualityProfile,
  type RenderQualityTier,
} from '../scene/renderQuality';
import { calculateDioramaLook, type DioramaLook } from './look';
import { calculateDialogue, type DialogueLine } from './dialogue';
import { SPEECH_BUBBLE_RESOLUTION, SpeechBubble } from './speechBubble';
import { SpriteTextureLibrary } from './spriteFactory';
import { DIORAMA, DIORAMA_SCALE_REPORT, cameraPanForWorldX, worldToDiorama, type DioramaSet } from './types';
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

    const checksPass = SCENE_PROPORTION_REPORT.valid && CAFE_LAYOUT_REPORT.valid
      && APPEARANCE_LIBRARY_REPORT.valid && DIORAMA_SCALE_REPORT.valid;
    canvas.dataset.proportionCheck = checksPass ? 'pass' : 'warning';
    canvas.dataset.layoutScore = String(Math.min(SCENE_PROPORTION_REPORT.score, CAFE_LAYOUT_REPORT.score, DIORAMA_SCALE_REPORT.score));
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
    canvas.dataset.speechLanguage = 'procedural-pseudo-language';
    canvas.dataset.speechBubbleResolution = SPEECH_BUBBLE_RESOLUTION;
    canvas.dataset.renderCount = '0';
  }

  setActive(active: boolean): void {
    this.active = active;
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
      this.venueSet.dispose();
      this.venue = venue;
      this.venueSet = buildVenue(venue);
      this.scene.add(this.venueSet.root);
      for (const node of this.guestNodes.values()) node.textureName = '';
      this.baristaNode.textureName = '';
    }
    this.canvas.dataset.venue = venue;
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
    this.updateCamera();
    this.updateVenue(time);
    this.updateDoor(snapshot.guests);
    this.updateCharacters(snapshot, time);
    this.updateWeather(time);
    this.updateEvent(snapshot, time);
    this.composer.render();
    this.renderCount += 1;
    this.canvas.dataset.renderCount = String(this.renderCount);
    this.updateDatasets(snapshot);
  }

  dispose(): void {
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
      this.scene.fog.density = 0.008 + this.look.fog * 0.055;
    }
    this.webgl.toneMappingExposure = this.look.exposure;
    this.hemisphere.color.copy(this.look.ambient);
    this.hemisphere.groundColor.copy(new Color(this.venueSet.theme.floor));
    this.hemisphere.intensity = 0.78 + this.look.daylight * 0.72;
    this.keyLight.color.copy(this.look.sun);
    this.keyLight.intensity = 0.7 + this.look.daylight * 3.5;
    this.keyLight.position.x = this.look.fromRight ? 8 : -8;
    for (const light of this.venueSet.practicalLights) light.intensity = 11 + this.look.night * 22;
    this.bloom.strength = this.look.bloom * this.qualityProfile.bloomStrength;
    this.miniature.uniforms.focusBand!.value = this.look.focusBand;
    this.miniature.uniforms.blurStrength!.value = this.look.blur * this.qualityProfile.miniatureBlurStrength;
    this.miniature.uniforms.vignette!.value = 0.18 + this.look.night * 0.08;
    this.miniature.uniforms.warmth!.value = this.venue === 'arcade' ? -0.08 : 0.12 + this.look.night * 0.08;
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
  }

  private updateCamera(): void {
    const worldCenter = this.camera.x + this.sceneWidth / 2;
    const targetX = cameraPanForWorldX(worldCenter) - DIORAMA.width / 2;
    this.perspective.position.x = targetX;
    this.perspective.lookAt(targetX, 2.55, -0.2);
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

  private updateDoor(guests: readonly Guest[]): void {
    const active = guests.some((guest) => (
      (guest.state === 'entering' || guest.state === 'exiting' || guest.state === 'walking-to-exit')
      && guest.position.x < 54
    ));
    const target = active ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * (this.reducedMotion ? 1 : 0.09);
    this.venueSet.doorPivot.rotation.y = this.doorOpen * 1.18;
  }

  private updateCharacters(snapshot: SceneSnapshot, time: number): void {
    const dialogue = this.active ? calculateDialogue(snapshot, time, this.venue, this.reducedMotion) : [];
    const lines = new Map(dialogue.map((line) => [line.speakerId, line]));
    this.activeSpeechBubbles = dialogue.length;
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
      this.updateGuestNode(node, guest, time, lines.get(guest.id));
    }
    this.updateBaristaNode(this.baristaNode, snapshot.barista, time, lines.get('barista'));
  }

  private updateGuestNode(node: CharacterNode, guest: Guest, time: number, dialogue?: DialogueLine): void {
    const point = worldToDiorama(guest.position);
    const seated = guest.state === 'activity';
    const bounce = this.active && !this.reducedMotion && !seated ? Math.abs(Math.sin(guest.animation * 5.5)) * 0.045 : 0;
    node.root.position.set(point.x, 0.07 + bounce, point.z);
    this.applySprite(node, this.spriteTextures.forGuest(guest, this.venue), seated, guest.facing);
    node.plane.rotation.copy(this.perspective.rotation);
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : guest.facing > 0;
    node.speech.update(dialogue, this.venue, tailLeft, seated ? DIORAMA.seatedHeight : DIORAMA.standingHeight);
    node.shadow.scale.set(seated ? 0.92 : 0.72, seated ? 1.3 : 1, 1);
    node.shadow.material.opacity = 0.22 + this.look.daylight * 0.09;
    node.root.renderOrder = Math.round(point.z * 100);
    if (guest.state === 'ordering') node.root.position.y += Math.sin(time * 2.2 + guest.animation) * 0.012;
  }

  private updateBaristaNode(node: CharacterNode, barista: Barista, time: number, dialogue?: DialogueLine): void {
    const point = worldToDiorama(barista.position);
    const bounce = this.active && !this.reducedMotion ? Math.abs(Math.sin(barista.animation * 4.2)) * 0.025 : 0;
    node.root.position.set(point.x, 0.07 + bounce, point.z);
    this.applySprite(node, this.spriteTextures.forBarista(barista, this.venue), false, barista.facing);
    node.plane.rotation.copy(this.perspective.rotation);
    node.speech.mesh.rotation.copy(this.perspective.rotation);
    const tailLeft = point.x < -6 ? true : point.x > 6 ? false : barista.facing > 0;
    node.speech.update(dialogue, this.venue, tailLeft, DIORAMA.standingHeight);
    if (barista.task === 'grinding') node.root.rotation.y = Math.sin(time * 8) * 0.012;
  }

  private applySprite(node: CharacterNode, texture: Texture, seated: boolean, facing: -1 | 1): void {
    if (node.textureName !== texture.name) {
      node.plane.material.map = texture;
      node.plane.material.needsUpdate = true;
      node.textureName = texture.name;
    }
    const height = seated ? DIORAMA.seatedHeight : DIORAMA.standingHeight;
    const width = height * (DIORAMA.spriteWidth / DIORAMA.spriteHeight);
    node.plane.scale.set(width * facing, height, 1);
    node.plane.position.y = height / 2;
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
    this.canvas.dataset.venue = this.venue;
    this.canvas.dataset.lighting = this.look.night > 0.5 ? 'lamplit' : this.look.daylight > 0.45 ? 'daylight' : 'soft';
    this.canvas.dataset.material = this.look.wetness > 0.12 ? 'wet' : this.look.fog > 0.15 ? 'misty' : 'dry';
    this.canvas.dataset.venueActivity = snapshot.barista.task;
    this.canvas.dataset.occupiedTables = String(snapshot.guests.filter((guest) => guest.state === 'activity').length);
    this.canvas.dataset.door = this.doorOpen > 0.03 ? 'opening' : 'closed';
    this.canvas.dataset.doorOpen = this.doorOpen.toFixed(2);
    this.canvas.dataset.bloom = this.look.bloom.toFixed(2);
    this.canvas.dataset.clock = 'analog';
    this.canvas.dataset.clockTime = this.environment?.localTimeText ?? '00:00';
    this.canvas.dataset.speechBubbles = String(this.activeSpeechBubbles);
  }

  private createCharacterNode(name: string): CharacterNode {
    const root = new Group();
    root.name = `character:${name}`;
    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshStandardMaterial({
      color: '#ffffff', transparent: true, alphaTest: 0.04, depthWrite: true,
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
