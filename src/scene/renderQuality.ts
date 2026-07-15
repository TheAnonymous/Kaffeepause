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

export interface RenderQualityGovernorOptions {
  readonly warmupMs?: number;
  readonly sampleFrames?: number;
  readonly slowFrameThresholdMs?: number;
  readonly slowFrameP95ThresholdMs?: number;
  readonly cooldownMs?: number;
}

/**
 * Session-local, downward-only quality governor. It only receives visible frame
 * durations, so background tabs cannot consume warmup, samples, or cooldown.
 */
export class RenderQualityGovernor {
  private readonly sampleFrames: number;
  private readonly slowFrameThresholdMs: number;
  private readonly slowFrameP95ThresholdMs: number;
  private readonly cooldownMs: number;
  private remainingDelayMs: number;
  private samples: number[] = [];
  private finished = false;

  constructor(
    private tier: RenderQualityTier = 'master',
    options: RenderQualityGovernorOptions = {},
  ) {
    this.remainingDelayMs = Math.max(0, options.warmupMs ?? 3_000);
    this.sampleFrames = Math.max(1, Math.round(options.sampleFrames ?? 120));
    this.slowFrameThresholdMs = Math.max(0, options.slowFrameThresholdMs ?? 16.7);
    this.slowFrameP95ThresholdMs = Math.max(0, options.slowFrameP95ThresholdMs ?? 25);
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 5_000);
  }

  get currentTier(): RenderQualityTier {
    return this.tier;
  }

  observeVisibleFrame(durationMs: number): RenderQualityTier | undefined {
    if (this.finished || !Number.isFinite(durationMs) || durationMs < 0) return undefined;
    if (this.remainingDelayMs > 0) {
      this.remainingDelayMs = Math.max(0, this.remainingDelayMs - durationMs);
      return undefined;
    }

    this.samples.push(durationMs);
    if (this.samples.length < this.sampleFrames) return undefined;

    const median = medianOf(this.samples);
    const sorted = [...this.samples].sort((left, right) => left - right);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
    this.samples = [];
    const lowerTier = median > this.slowFrameThresholdMs || p95 > this.slowFrameP95ThresholdMs
      ? lowerQualityTier(this.tier)
      : undefined;
    if (!lowerTier) {
      this.finished = true;
      return undefined;
    }

    this.tier = lowerTier;
    if (lowerTier === 'fallback') this.finished = true;
    else this.remainingDelayMs = this.cooldownMs;
    return lowerTier;
  }
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
