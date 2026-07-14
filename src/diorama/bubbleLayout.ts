import type { DialogueKind } from './dialogue';

export interface BubbleBounds {
  readonly speakerId: string;
  readonly kind: DialogueKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BubblePlacement {
  readonly speakerId: string;
  readonly visible: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
}

const PRIORITY: Readonly<Record<DialogueKind, number>> = {
  reaction: 4,
  moment: 3,
  order: 2,
  conversation: 1,
};

function overlaps(
  left: BubbleBounds,
  right: BubbleBounds,
  leftOffsetX = 0,
  leftOffsetY = 0,
  rightOffsetX = 0,
  rightOffsetY = 0,
): boolean {
  return Math.abs(left.x + leftOffsetX - right.x - rightOffsetX) < (left.width + right.width) / 2
    && Math.abs(left.y + leftOffsetY - right.y - rightOffsetY) < (left.height + right.height) / 2;
}

/**
 * At most two bubbles are emitted by the dialogue director. When their screen
 * rectangles meet, this first gives them a small stagger and then suppresses
 * only the lower-priority bubble if the stagger is still insufficient.
 */
export function resolveBubblePlacements(bounds: readonly BubbleBounds[]): readonly BubblePlacement[] {
  const placements = bounds.map((entry) => ({
    speakerId: entry.speakerId,
    visible: true,
    offsetX: 0,
    offsetY: 0,
  }));
  const first = bounds[0];
  const second = bounds[1];
  const firstPlacement = placements[0];
  const secondPlacement = placements[1];
  if (!first || !second || !firstPlacement || !secondPlacement || !overlaps(first, second)) return placements;

  const firstGoesLeft = first.x <= second.x;
  const firstHorizontal = first.width * (firstGoesLeft ? -0.22 : 0.22);
  const secondHorizontal = second.width * (firstGoesLeft ? 0.22 : -0.22);
  const firstVertical = -first.height * 0.14;
  const secondVertical = second.height * 0.14;
  placements[0] = { ...firstPlacement, offsetX: firstHorizontal, offsetY: firstVertical };
  placements[1] = { ...secondPlacement, offsetX: secondHorizontal, offsetY: secondVertical };

  if (overlaps(first, second, firstHorizontal, firstVertical, secondHorizontal, secondVertical)) {
    const lowerIndex = PRIORITY[first.kind] < PRIORITY[second.kind] ? 0 : 1;
    const lower = placements[lowerIndex];
    if (lower) placements[lowerIndex] = { ...lower, visible: false };
  }
  return placements;
}
