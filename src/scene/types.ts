import type { Barista, CafeAccident, CafeMoment, CafeStoryKind, Guest, RegularId } from '../simulation/types';

// Der Renderer erhält nur diese Momentaufnahme und greift nie direkt in die Simulation ein.
export interface SceneSnapshot {
  readonly guests: readonly Guest[];
  readonly barista: Barista;
  readonly accident?: CafeAccident;
  readonly moment?: CafeMoment;
  readonly regularIds: readonly RegularId[];
  readonly storyStages: Readonly<Record<CafeStoryKind, number>>;
}
