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

const SCREEN_MARGIN = 6;

/**
 * Pushes bubbles back inside the visible canvas (sideways and down from the top). A bubble
 * that would need to move by most of its size belongs to a speaker outside the frame (for
 * example during the mobile tour) and is hidden instead of showing a sliver.
 */
export function keepBubblesOnScreen(
  bounds: readonly BubbleBounds[],
  placements: readonly BubblePlacement[],
  screenWidth: number,
): readonly BubblePlacement[] {
  return placements.map((placement) => {
    const entry = bounds.find((candidate) => candidate.speakerId === placement.speakerId);
    if (!entry || !placement.visible) return placement;
    const left = entry.x + placement.offsetX - entry.width / 2;
    const right = entry.x + placement.offsetX + entry.width / 2;
    const top = entry.y + placement.offsetY - entry.height / 2;
    let shift = 0;
    if (left < SCREEN_MARGIN) shift = SCREEN_MARGIN - left;
    else if (right > screenWidth - SCREEN_MARGIN) shift = screenWidth - SCREEN_MARGIN - right;
    if (Math.abs(shift) > entry.width * 0.6) return { ...placement, visible: false };
    // Oben ragt eine Blase in Nahaufnahmen aus dem Bild; dann rückt sie herunter, aber nicht bis aufs Gesicht.
    const drop = top < SCREEN_MARGIN ? SCREEN_MARGIN - top : 0;
    if (drop > entry.height * 0.6) return { ...placement, visible: false };
    return shift === 0 && drop === 0 ? placement : { ...placement, offsetX: placement.offsetX + shift, offsetY: placement.offsetY + drop };
  });
}

export interface FaceBox {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Ab diesem Anteil gilt ein Gesicht als verdeckt. */
const FACE_COVER_LIMIT = 0.15;

/**
 * Sprechblasen hängen über dem Kopf des Sprechers, und von vorn gesehen sitzt dort oft jemand weiter hinten.
 * Verdeckt eine Blase ein fremdes Gesicht, rückt sie zur Seite oder etwas höher, solange sie im Bild bleibt
 * und keine andere Blase trifft.
 */
export function avoidFaces(
  bounds: readonly BubbleBounds[],
  placements: readonly BubblePlacement[],
  faces: readonly FaceBox[],
  screenWidth: number,
): readonly BubblePlacement[] {
  const placed: { entry: BubbleBounds; offsetX: number; offsetY: number }[] = [];
  return placements.map((placement) => {
    const entry = bounds.find((candidate) => candidate.speakerId === placement.speakerId);
    if (!entry || !placement.visible) return placement;
    const coverage = (offsetX: number, offsetY: number): number => {
      const left = entry.x + offsetX - entry.width / 2;
      const right = entry.x + offsetX + entry.width / 2;
      const top = entry.y + offsetY - entry.height / 2;
      const bottom = entry.y + offsetY + entry.height / 2;
      let worst = 0;
      for (const face of faces) {
        if (face.id === entry.speakerId) continue;
        const width = Math.max(0, Math.min(right, face.right) - Math.max(left, face.left));
        const height = Math.max(0, Math.min(bottom, face.bottom) - Math.max(top, face.top));
        const area = Math.max(1, (face.right - face.left) * (face.bottom - face.top));
        worst = Math.max(worst, width * height / area);
      }
      return worst;
    };
    const fits = (offsetX: number, offsetY: number): boolean => {
      const left = entry.x + offsetX - entry.width / 2;
      const right = entry.x + offsetX + entry.width / 2;
      const top = entry.y + offsetY - entry.height / 2;
      if (left < SCREEN_MARGIN || right > screenWidth - SCREEN_MARGIN || top < SCREEN_MARGIN) return false;
      return placed.every((other) => !overlaps(entry, other.entry, offsetX, offsetY, other.offsetX, other.offsetY));
    };
    const shifts: readonly (readonly [number, number])[] = [
      [0, 0], [-0.62, 0], [0.62, 0], [0, -0.5], [-0.62, -0.5], [0.62, -0.5], [-1.05, 0], [1.05, 0], [-1.05, -0.5], [1.05, -0.5],
    ];
    let best = { offsetX: placement.offsetX, offsetY: placement.offsetY, cover: coverage(placement.offsetX, placement.offsetY) };
    if (best.cover > FACE_COVER_LIMIT) {
      for (const [dx, dy] of shifts) {
        const offsetX = placement.offsetX + dx * entry.width;
        const offsetY = placement.offsetY + dy * entry.height;
        if (!fits(offsetX, offsetY)) continue;
        const cover = coverage(offsetX, offsetY);
        if (cover < best.cover - 0.05) best = { offsetX, offsetY, cover };
        if (cover <= FACE_COVER_LIMIT) break;
      }
    }
    placed.push({ entry, offsetX: best.offsetX, offsetY: best.offsetY });
    return best.offsetX === placement.offsetX && best.offsetY === placement.offsetY
      ? placement
      : { ...placement, offsetX: best.offsetX, offsetY: best.offsetY };
  });
}
