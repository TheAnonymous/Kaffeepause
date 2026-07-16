import {
  Color,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Scene as WorldScene } from 'three';
import type { RenderQualityProfile } from '../scene/renderQuality';
import { SELECTIVE_BLOOM_LAYER } from './selectiveBloom';

export interface FixedRenderPipelineLook {
  readonly bloomStrength: number;
  readonly bloomThreshold: number;
  readonly focusBand: number;
  readonly blurStrength: number;
  readonly vignette: number;
  readonly warmth: number;
  readonly saturation: number;
  readonly shadowLift: number;
  readonly time: number;
}

const FULLSCREEN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAGMENT = `
  uniform sampler2D inputTexture;
  uniform vec2 direction;
  uniform float threshold;
  uniform float thresholdEnabled;
  varying vec2 vUv;

  vec3 bright(vec3 color) {
    float luminance = max(max(color.r, color.g), color.b);
    float contribution = thresholdEnabled > 0.5 ? smoothstep(threshold, threshold + 0.12, luminance) : 1.0;
    return color * contribution;
  }

  void main() {
    vec3 color = bright(texture2D(inputTexture, vUv).rgb) * 0.227027;
    color += bright(texture2D(inputTexture, vUv + direction * 1.384615).rgb) * 0.316216;
    color += bright(texture2D(inputTexture, vUv - direction * 1.384615).rgb) * 0.316216;
    color += bright(texture2D(inputTexture, vUv + direction * 3.230769).rgb) * 0.070270;
    color += bright(texture2D(inputTexture, vUv - direction * 3.230769).rgb) * 0.070270;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = `
  uniform sampler2D baseTexture;
  uniform sampler2D bloomTexture;
  uniform float bloomMix;
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

  vec4 sampleScene(vec2 uv) {
    vec4 base = texture2D(baseTexture, uv);
    return vec4(base.rgb + texture2D(bloomTexture, uv).rgb * bloomMix, base.a);
  }

  void main() {
    float distanceFromFocus = abs(vUv.y - focusBand);
    float miniatureBlur = smoothstep(0.18, 0.49, distanceFromFocus);
    vec2 offset = vec2(blurStrength * miniatureBlur, blurStrength * 0.62 * miniatureBlur);
    vec4 color;
    if (simplifiedBlur > 0.5) {
      color = sampleScene(vUv) * 0.76;
      color += sampleScene(vUv + vec2(offset.x, 0.0)) * 0.12;
      color += sampleScene(vUv - vec2(offset.x, 0.0)) * 0.12;
    } else {
      color = sampleScene(vUv) * 0.32;
      color += sampleScene(vUv + vec2(offset.x, 0.0)) * 0.12;
      color += sampleScene(vUv - vec2(offset.x, 0.0)) * 0.12;
      color += sampleScene(vUv + vec2(0.0, offset.y)) * 0.12;
      color += sampleScene(vUv - vec2(0.0, offset.y)) * 0.12;
      color += sampleScene(vUv + offset) * 0.10;
      color += sampleScene(vUv - offset) * 0.10;
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
    color.rgb *= 1.0 + sin(time * 0.37) * 0.002;
    gl_FragColor = color;
  }
`;

function target(depthBuffer: boolean): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer,
    stencilBuffer: false,
  });
}

export class FixedRenderPipeline {
  private readonly baseTarget = target(true);
  private readonly bloomTarget = target(true);
  private readonly blurTargetA = target(false);
  private readonly blurTargetB = target(false);
  private readonly fullscreenScene = new Scene();
  private readonly fullscreenCamera: Camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly blurMaterial = new ShaderMaterial({
    uniforms: {
      inputTexture: { value: null as Texture | null },
      direction: { value: new Vector2() },
      threshold: { value: 0.86 },
      thresholdEnabled: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly compositeMaterial = new ShaderMaterial({
    uniforms: {
      baseTexture: { value: this.baseTarget.texture },
      bloomTexture: { value: this.blurTargetB.texture },
      bloomMix: { value: 1 },
      resolution: { value: new Vector2(1, 1) },
      focusBand: { value: 0.57 },
      blurStrength: { value: 0.0016 },
      vignette: { value: 0.22 },
      warmth: { value: 0.05 },
      saturation: { value: 1.08 },
      shadowLift: { value: 0.03 },
      time: { value: 0 },
      simplifiedBlur: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly quad = new Mesh(this.geometry, this.compositeMaterial);
  private readonly bloomBackground = new Color('#000000');
  private profile: RenderQualityProfile;
  private width = 1;
  private height = 1;
  private bloomWidth = 1;
  private bloomHeight = 1;

  constructor(private readonly renderer: WebGLRenderer, profile: RenderQualityProfile) {
    this.profile = profile;
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);
    this.applyProfile(profile);
  }

  get renderTargetCount(): number { return 4; }
  get estimatedTextureBytes(): number {
    return (this.width * this.height + this.bloomWidth * this.bloomHeight * 3) * 4;
  }
  get bloomResolution(): string {
    const mode = this.profile.tier === 'master' ? 'half' : this.profile.tier === 'balanced' ? 'quarter' : 'off';
    return `${mode}:${this.bloomWidth}x${this.bloomHeight}`;
  }

  applyProfile(profile: RenderQualityProfile): void {
    this.profile = profile;
    this.compositeMaterial.uniforms.simplifiedBlur!.value = profile.miniatureBlur === 'simplified' ? 1 : 0;
    this.resize(this.width, this.height);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.ceil(width));
    this.height = Math.max(1, Math.ceil(height));
    const divisor = this.profile.tier === 'master' ? 2 : this.profile.tier === 'balanced' ? 4 : Math.max(this.width, this.height);
    this.bloomWidth = Math.max(1, Math.ceil(this.width / divisor));
    this.bloomHeight = Math.max(1, Math.ceil(this.height / divisor));
    this.baseTarget.setSize(this.width, this.height);
    this.bloomTarget.setSize(this.bloomWidth, this.bloomHeight);
    this.blurTargetA.setSize(this.bloomWidth, this.bloomHeight);
    this.blurTargetB.setSize(this.bloomWidth, this.bloomHeight);
    this.compositeMaterial.uniforms.resolution!.value.set(this.width, this.height);
  }

  setLook(look: FixedRenderPipelineLook): void {
    this.compositeMaterial.uniforms.bloomMix!.value = this.profile.bloom === 'off' ? 0 : look.bloomStrength;
    this.compositeMaterial.uniforms.focusBand!.value = look.focusBand;
    this.compositeMaterial.uniforms.blurStrength!.value = look.blurStrength;
    this.compositeMaterial.uniforms.vignette!.value = look.vignette;
    this.compositeMaterial.uniforms.warmth!.value = look.warmth;
    this.compositeMaterial.uniforms.saturation!.value = look.saturation;
    this.compositeMaterial.uniforms.shadowLift!.value = look.shadowLift;
    this.compositeMaterial.uniforms.time!.value = look.time;
    this.blurMaterial.uniforms.threshold!.value = look.bloomThreshold;
  }

  render(scene: WorldScene, camera: Camera): void {
    const previousTarget = this.renderer.getRenderTarget();
    const previousMask = camera.layers.mask;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setRenderTarget(this.baseTarget);
    camera.layers.set(0);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    if (this.profile.bloom !== 'off') {
      const background = scene.background;
      scene.background = this.bloomBackground;
      this.renderer.setRenderTarget(this.bloomTarget);
      camera.layers.set(SELECTIVE_BLOOM_LAYER);
      this.renderer.clear();
      this.renderer.render(scene, camera);
      scene.background = background;

      this.quad.material = this.blurMaterial;
      this.blurMaterial.uniforms.inputTexture!.value = this.bloomTarget.texture;
      this.blurMaterial.uniforms.direction!.value.set(1 / this.bloomWidth, 0);
      this.blurMaterial.uniforms.thresholdEnabled!.value = 1;
      this.renderer.setRenderTarget(this.blurTargetA);
      this.renderer.clear();
      this.renderer.render(this.fullscreenScene, this.fullscreenCamera);

      this.blurMaterial.uniforms.inputTexture!.value = this.blurTargetA.texture;
      this.blurMaterial.uniforms.direction!.value.set(0, 1 / this.bloomHeight);
      this.blurMaterial.uniforms.thresholdEnabled!.value = 0;
      this.renderer.setRenderTarget(this.blurTargetB);
      this.renderer.clear();
      this.renderer.render(this.fullscreenScene, this.fullscreenCamera);
    }

    camera.layers.mask = previousMask;
    this.quad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);
  }

  dispose(): void {
    this.baseTarget.dispose();
    this.bloomTarget.dispose();
    this.blurTargetA.dispose();
    this.blurTargetB.dispose();
    this.geometry.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
