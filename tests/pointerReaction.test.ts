import { describe, expect, it } from 'vitest';
import {
  PointerReactionController,
  REACTION_CHARACTER_COOLDOWN_SECONDS,
} from '../src/diorama/pointerReaction';

describe('Mausnähe-Reaktionen', () => {
  it('aktiviert nur das nächste Ziel nach 300 ms innerhalb von 72 CSS-Pixeln', () => {
    const controller = new PointerReactionController();
    const targets = [{ id: 'guest-1', x: 100, y: 100 }, { id: 'barista' as const, x: 130, y: 100 }];
    expect(controller.update(0, { x: 105, y: 100 }, targets, 'cafe').started).toBeUndefined();
    expect(controller.update(0.29, { x: 105, y: 100 }, targets, 'cafe').started).toBeUndefined();
    expect(controller.update(0.3, { x: 105, y: 100 }, targets, 'cafe').started?.characterId).toBe('guest-1');
  });

  it('behält Verweildauer bis 96 Pixel und setzt sie außerhalb zurück', () => {
    const controller = new PointerReactionController();
    const targets = [{ id: 'guest-1', x: 100, y: 100 }];
    controller.update(0, { x: 170, y: 100 }, targets, 'cafe');
    expect(controller.update(0.2, { x: 195, y: 100 }, targets, 'cafe').started).toBeUndefined();
    expect(controller.update(0.3, { x: 195, y: 100 }, targets, 'cafe').started?.characterId).toBe('guest-1');

    const reset = new PointerReactionController();
    reset.update(0, { x: 170, y: 100 }, targets, 'cafe');
    reset.update(0.2, { x: 197, y: 100 }, targets, 'cafe');
    reset.update(0.21, { x: 170, y: 100 }, targets, 'cafe');
    expect(reset.update(0.49, { x: 170, y: 100 }, targets, 'cafe').started).toBeUndefined();
    expect(reset.update(0.52, { x: 170, y: 100 }, targets, 'cafe').started?.characterId).toBe('guest-1');
  });

  it('respektiert globale und figurenbezogene Cooldowns', () => {
    const controller = new PointerReactionController();
    const first = [{ id: 'guest-1', x: 100, y: 100 }];
    controller.update(0, { x: 100, y: 100 }, first, 'cafe');
    controller.update(0.3, { x: 100, y: 100 }, first, 'cafe');
    controller.clearPointer();
    const second = [{ id: 'guest-2', x: 200, y: 100 }];
    controller.update(3.6, { x: 200, y: 100 }, second, 'cafe');
    expect(controller.update(3.9, { x: 200, y: 100 }, second, 'cafe').started).toBeUndefined();
    expect(controller.update(6.31, { x: 200, y: 100 }, second, 'cafe').started?.characterId).toBe('guest-2');

    controller.clearPointer();
    controller.update(10, { x: 100, y: 100 }, first, 'cafe');
    expect(controller.update(10.5, { x: 100, y: 100 }, first, 'cafe').started).toBeUndefined();
    expect(REACTION_CHARACTER_COOLDOWN_SECONDS).toBe(12);
  });
});

