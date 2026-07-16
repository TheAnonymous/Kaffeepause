import { SCENE_PROPORTIONS } from './proportions';

export type RenderQualityTier = 'master' | 'balanced' | 'fallback';

export interface RenderQualityProfile {
  readonly tier: RenderQualityTier;
  readonly renderScale: 6 | 4 | 3;
  readonly shadowMapSize: 2048 | 1024 | 512;
  readonly bloom: 'full' | 'reduced' | 'off';
  readonly bloomStrength: number;
  readonly miniatureBlur: 'full' | 'simplified';
  readonly miniatureBlurStrength: number;
  readonly characterFrameRate: 6 | 4 | 3;
}

export const RENDER_QUALITY_PROFILES: Readonly<Record<RenderQualityTier, RenderQualityProfile>> = {
  master: {
    tier: 'master', renderScale: 6, shadowMapSize: 2048,
    bloom: 'full', bloomStrength: 1, miniatureBlur: 'full', miniatureBlurStrength: 1, characterFrameRate: 6,
  },
  balanced: {
    tier: 'balanced', renderScale: 4, shadowMapSize: 1024,
    bloom: 'reduced', bloomStrength: 0.62, miniatureBlur: 'full', miniatureBlurStrength: 0.72, characterFrameRate: 4,
  },
  fallback: {
    tier: 'fallback', renderScale: 3, shadowMapSize: 512,
    bloom: 'off', bloomStrength: 0, miniatureBlur: 'simplified', miniatureBlurStrength: 0.48, characterFrameRate: 3,
  },
};

export const RENDER_QUALITY = {
  tier: 'hd2d-master',
  masterScale: SCENE_PROPORTIONS.world.renderScale,
  masterWidth: SCENE_PROPORTIONS.world.width * SCENE_PROPORTIONS.world.renderScale,
  masterHeight: SCENE_PROPORTIONS.world.height * SCENE_PROPORTIONS.world.renderScale,
  characterRasterHeight: SCENE_PROPORTIONS.character.standingHeight * SCENE_PROPORTIONS.world.renderScale,
  faceRasterHeight: SCENE_PROPORTIONS.character.headHeight * SCENE_PROPORTIONS.world.renderScale,
  bloomDownsample: 4,
} as const;

export interface RenderQualityReport {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly string[];
  readonly physicalPixels: number;
}

export function validateRenderQuality(
  quality: Readonly<typeof RENDER_QUALITY> = RENDER_QUALITY,
): RenderQualityReport {
  const issues: string[] = [];
  if (quality.masterScale < 6) issues.push('master-scale-below-6x');
  if (quality.masterWidth < 2_304 || quality.masterHeight < 1_296) issues.push('master-resolution-too-low');
  if (quality.characterRasterHeight < 180) issues.push('character-raster-too-low');
  if (quality.faceRasterHeight < 54) issues.push('face-raster-too-low');
  if (quality.bloomDownsample < 2 || quality.bloomDownsample > 6) issues.push('bloom-buffer-range');

  return {
    valid: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 20),
    issues,
    physicalPixels: quality.masterWidth * quality.masterHeight,
  };
}

export const RENDER_QUALITY_REPORT = validateRenderQuality();

export function parseRenderQualityOverride(search: string, enabled: boolean): RenderQualityTier | undefined {
  if (!enabled) return undefined;
  const requested = new URLSearchParams(search).get('quality');
  return requested === 'master' || requested === 'balanced' || requested === 'fallback'
    ? requested
    : undefined;
}

export function lowerQualityTier(tier: RenderQualityTier): RenderQualityTier | undefined {
  if (tier === 'master') return 'balanced';
  if (tier === 'balanced') return 'fallback';
  return undefined;
}

export function initialRenderQualityTier(cssWidth: number): RenderQualityTier {
  return Number.isFinite(cssWidth) && cssWidth >= 700 ? 'master' : 'balanced';
}

export interface RenderPerformanceSample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly gpuMs?: number;
  readonly timestampMs: number;
}

export interface RenderPerformanceContext {
  readonly mobile: boolean;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
}

export interface RenderPerformanceWindow {
  readonly samples: number;
  readonly frameP95: number;
  readonly cpuP95: number;
  readonly gpuP95?: number;
  readonly healthy: boolean;
  readonly reason: string;
}

export interface AdaptiveQualityDecision {
  readonly previousTier: RenderQualityTier;
  readonly tier: RenderQualityTier;
  readonly action: 'downgrade' | 'upgrade';
  readonly reason: string;
  readonly window: RenderPerformanceWindow;
}

export interface RenderQualityGovernorOptions {
  readonly warmupMs?: number;
  readonly sampleFrames?: number;
  readonly cooldownMs?: number;
  readonly stablePromotionMs?: number;
  readonly badWindowsBeforeDowngrade?: number;
  readonly healthyWindowsBeforeUpgrade?: number;
  readonly desktopFrameP95Ms?: number;
  readonly mobileFrameP95Ms?: number;
  readonly cpuP95Ms?: number;
  readonly gpuP95Ms?: number;
}

/**
 * Session-local adaptive governor. Only complete visible, motion-enabled samples
 * consume warm-up or performance windows; a downgrade permanently locks upgrades.
 */
export class RenderQualityGovernor {
  private readonly warmupMs: number;
  private readonly sampleFrames: number;
  private readonly cooldownMs: number;
  private readonly stablePromotionMs: number;
  private readonly badWindowsBeforeDowngrade: number;
  private readonly healthyWindowsBeforeUpgrade: number;
  private readonly desktopFrameP95Ms: number;
  private readonly mobileFrameP95Ms: number;
  private readonly cpuP95Ms: number;
  private readonly gpuP95Ms: number;
  private samples: RenderPerformanceSample[] = [];
  private startedAt?: number;
  private stableSince?: number;
  private lastDecisionAt = Number.NEGATIVE_INFINITY;
  private badWindows = 0;
  private healthyWindows = 0;
  private upgradeUsed = false;
  private downgraded = false;
  private sampleMobile?: boolean;
  private recentWindow?: RenderPerformanceWindow;

  constructor(
    private tier: RenderQualityTier = 'master',
    options: RenderQualityGovernorOptions = {},
  ) {
    this.warmupMs = Math.max(0, options.warmupMs ?? 3_000);
    this.sampleFrames = Math.max(1, Math.round(options.sampleFrames ?? 180));
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 5_000);
    this.stablePromotionMs = Math.max(0, options.stablePromotionMs ?? 10_000);
    this.badWindowsBeforeDowngrade = Math.max(1, Math.round(options.badWindowsBeforeDowngrade ?? 2));
    this.healthyWindowsBeforeUpgrade = Math.max(1, Math.round(options.healthyWindowsBeforeUpgrade ?? 3));
    this.desktopFrameP95Ms = Math.max(0, options.desktopFrameP95Ms ?? 25);
    this.mobileFrameP95Ms = Math.max(0, options.mobileFrameP95Ms ?? 33);
    this.cpuP95Ms = Math.max(0, options.cpuP95Ms ?? 12);
    this.gpuP95Ms = Math.max(0, options.gpuP95Ms ?? 18);
  }

  get currentTier(): RenderQualityTier {
    return this.tier;
  }

  get lastWindow(): RenderPerformanceWindow | undefined { return this.recentWindow; }

  observe(sample: RenderPerformanceSample, context: RenderPerformanceContext): AdaptiveQualityDecision | undefined {
    if (!context.visible || context.reducedMotion || !validDuration(sample.frameMs)
      || !validDuration(sample.cpuMs) || !validDuration(sample.timestampMs)) return undefined;
    if (this.startedAt === undefined) this.startedAt = sample.timestampMs;
    if (sample.timestampMs - this.startedAt < this.warmupMs) return undefined;
    if (this.sampleMobile !== undefined && this.sampleMobile !== context.mobile) {
      this.samples = [];
      this.badWindows = 0;
      this.healthyWindows = 0;
      this.stableSince = sample.timestampMs;
    }
    this.sampleMobile = context.mobile;
    if (this.stableSince === undefined) this.stableSince = sample.timestampMs;
    this.samples.push({
      ...sample,
      ...(sample.gpuMs !== undefined && validDuration(sample.gpuMs) ? { gpuMs: sample.gpuMs } : { gpuMs: undefined }),
    });
    if (this.samples.length < this.sampleFrames) return undefined;
    const gpuSamples = this.samples.flatMap((entry) => entry.gpuMs === undefined ? [] : [entry.gpuMs]);
    const frameP95 = percentile95(this.samples.map((entry) => entry.frameMs));
    const cpuP95 = percentile95(this.samples.map((entry) => entry.cpuMs));
    const gpuP95 = gpuSamples.length > 0 ? percentile95(gpuSamples) : undefined;
    this.samples = [];
    const reasons = [
      ...(frameP95 > (context.mobile ? this.mobileFrameP95Ms : this.desktopFrameP95Ms) ? ['frame-p95'] : []),
      ...(cpuP95 > this.cpuP95Ms ? ['cpu-p95'] : []),
      ...(gpuP95 !== undefined && gpuP95 > this.gpuP95Ms ? ['gpu-p95'] : []),
    ];
    const window: RenderPerformanceWindow = {
      samples: this.sampleFrames,
      frameP95,
      cpuP95,
      ...(gpuP95 === undefined ? {} : { gpuP95 }),
      healthy: reasons.length === 0,
      reason: reasons.join('+') || 'healthy',
    };
    this.recentWindow = window;

    if (!window.healthy) {
      this.badWindows += 1;
      this.healthyWindows = 0;
      this.stableSince = undefined;
      if (this.badWindows < this.badWindowsBeforeDowngrade
        || sample.timestampMs - this.lastDecisionAt < this.cooldownMs) return undefined;
      const lowerTier = lowerQualityTier(this.tier);
      if (!lowerTier) return undefined;
      const previousTier = this.tier;
      this.tier = lowerTier;
      this.badWindows = 0;
      this.lastDecisionAt = sample.timestampMs;
      this.downgraded = true;
      return { previousTier, tier: lowerTier, action: 'downgrade', reason: window.reason, window };
    }

    this.badWindows = 0;
    this.healthyWindows += 1;
    if (!context.mobile || this.tier !== 'balanced' || this.upgradeUsed || this.downgraded
      || this.healthyWindows < this.healthyWindowsBeforeUpgrade
      || sample.timestampMs - (this.stableSince ?? sample.timestampMs) < this.stablePromotionMs
      || sample.timestampMs - this.lastDecisionAt < this.cooldownMs) {
      return undefined;
    }
    const previousTier = this.tier;
    this.tier = 'master';
    this.upgradeUsed = true;
    this.lastDecisionAt = sample.timestampMs;
    this.healthyWindows = 0;
    return { previousTier, tier: 'master', action: 'upgrade', reason: 'mobile-stable', window };
  }
}

function validDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[Math.max(0, middle - 1)] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

export interface FrameBudgetReport {
  readonly valid: boolean;
  readonly median: number;
  readonly p95: number;
  readonly samples: number;
  readonly profile: 'desktop' | 'mobile';
}

export class FrameBudgetProbe {
  private warmupRemainingMs: number;
  private measurementRemainingMs: number;
  private samples: number[] = [];
  private report?: FrameBudgetReport;

  constructor(warmupMs = 3_000, measurementMs = 60_000) {
    this.warmupRemainingMs = Math.max(0, warmupMs);
    this.measurementRemainingMs = Math.max(1, measurementMs);
  }

  observe(durationMs: number, mobile: boolean): FrameBudgetReport | undefined {
    if (this.report || !Number.isFinite(durationMs) || durationMs < 0) return this.report;
    if (this.warmupRemainingMs > 0) {
      this.warmupRemainingMs = Math.max(0, this.warmupRemainingMs - durationMs);
      return undefined;
    }
    this.samples.push(durationMs);
    this.measurementRemainingMs -= durationMs;
    if (this.measurementRemainingMs > 0) return undefined;
    const sorted = [...this.samples].sort((left, right) => left - right);
    const median = medianOf(sorted);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
    const profile = mobile ? 'mobile' : 'desktop';
    this.report = {
      valid: mobile ? p95 <= 33 : median <= 16.7 && p95 <= 25,
      median,
      p95,
      samples: sorted.length,
      profile,
    };
    this.samples = [];
    return this.report;
  }
}
