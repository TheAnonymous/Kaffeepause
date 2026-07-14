import { SCENE_PROPORTIONS } from './proportions';

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
