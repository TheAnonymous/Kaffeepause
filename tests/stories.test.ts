import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';
import type { CafeStoryKind } from '../src/simulation/types';

function updateUntil(simulation: CafeSimulation, predicate: () => boolean, limit = 2_000): void {
  for (let index = 0; index < limit && !predicate(); index += 1) simulation.update(0.1);
  expect(predicate()).toBe(true);
}

function storySimulation(kind: CafeStoryKind): CafeSimulation {
  const venue = kind === 'arcade-rivals' || kind === 'glitched-coop' ? 'arcade'
    : kind === 'noodle-mishap' ? 'ramen' : 'cafe';
  const guestCount = kind === 'order-mixup' ? 6
    : kind === 'noodle-mishap' ? 2
      : venue === 'arcade' ? 4 : 4;
  const simulation = new CafeSimulation({
    seed: 81,
    initialGuests: guestCount,
    minGuests: 0,
    maxGuests: guestCount,
    venue,
    accidents: false,
    moments: false,
    stories: { seed: 31, minDelaySeconds: 0.1, maxDelaySeconds: 0.1, kinds: [kind] },
  });
  simulation.start();
  return simulation;
}

describe('Stammgäste und kleine Geschichten', () => {
  it('besetzt die erste ruhige Café-Runde mit wiedererkennbaren Stammgästen', () => {
    const simulation = storySimulation('sketchbook');

    expect(simulation.activeRegulars.map((guest) => guest.regularId)).toEqual(['mara', 'noor', 'toni', 'linn']);
    expect(simulation.activeRegulars.map((guest) => guest.name)).toEqual(['Mara', 'Noor', 'Toni', 'Linn']);
    expect(simulation.activeRegulars.find((guest) => guest.regularId === 'mara')?.activity).toBe('sketching');
    expect(simulation.activeRegulars.find((guest) => guest.regularId === 'linn')?.activity).toBe('knitting');
  });

  it.each<[CafeStoryKind, readonly string[], number]>([
    ['sketchbook', ['mara'], 2],
    ['first-date', ['noor', 'toni'], 2],
    ['arcade-rivals', ['sora', 'kai'], 2],
  ])('%s entfaltet sich in zwei ruhigen, zusammenhängenden Momenten', (story, regulars, finalStep) => {
    const simulation = storySimulation(story);
    updateUntil(simulation, () => simulation.activeMoment?.story === story && simulation.activeMoment.storyStep === 1);
    expect(simulation.activeMoment?.participantIds).toEqual(
      expect.arrayContaining(regulars.map((regular) => simulation.activeRegulars.find((guest) => guest.regularId === regular)?.id)),
    );

    updateUntil(simulation, () => simulation.activeMoment?.story === story && simulation.activeMoment.storyStep === 2);
    expect(simulation.getStoryStage(story)).toBe(1);

    updateUntil(simulation, () => simulation.getStoryStage(story) === finalStep);
    expect(simulation.stats.storyBeatsCompleted).toBe(2);
    expect(simulation.stats.storiesCompleted).toBe(1);
  });

  it.each<[CafeStoryKind, readonly string[]]>([
    ['order-mixup', ['bo', 'cleo']],
    ['noodle-mishap', ['jun', 'emi']],
    ['glitched-coop', ['ari', 'mika']],
  ])('%s entfaltet sich in drei lesbaren Schritten', (story, regulars) => {
    const simulation = storySimulation(story);
    for (const step of [1, 2, 3] as const) {
      updateUntil(simulation, () => simulation.activeMoment?.story === story && simulation.activeMoment.storyStep === step);
      expect(simulation.activeMoment?.participantIds).toEqual(
        expect.arrayContaining(regulars.map((regular) => simulation.activeRegulars.find((guest) => guest.regularId === regular)?.id)),
      );
    }
    updateUntil(simulation, () => simulation.getStoryStage(story) === 3);
    expect(simulation.stats.storyBeatsCompleted).toBe(3);
    expect(simulation.stats.storiesCompleted).toBe(1);
  });

  it.each([
    ['cafe', ['mara', 'noor', 'toni', 'linn', 'bo', 'cleo']],
    ['ramen', ['jun', 'emi']],
    ['arcade', ['sora', 'kai', 'ari', 'mika']],
  ] as const)('ordnet die Stammgäste in %s ausschließlich ihrem Heimatort zu', (venue, expected) => {
    const simulation = new CafeSimulation({
      venue, seed: 4, initialGuests: 6, minGuests: 0, maxGuests: 6,
      accidents: false, moments: false, stories: false,
    });
    simulation.start();
    expect(simulation.activeRegulars.map((guest) => guest.regularId)).toEqual(expected);
    expect(simulation.guests.slice(expected.length).every((guest) => guest.regularId === undefined)).toBe(true);
  });

  it('setzt die Arcade-Revanche sichtbar aus Duell und Highscore zusammen', () => {
    const simulation = storySimulation('arcade-rivals');
    updateUntil(simulation, () => simulation.activeMoment?.story === 'arcade-rivals' && simulation.activeMoment.storyStep === 1);
    expect(simulation.activeMoment?.kind).toBe('arcade-duel');

    updateUntil(simulation, () => simulation.activeMoment?.story === 'arcade-rivals' && simulation.activeMoment.storyStep === 2);
    expect(simulation.activeMoment?.kind).toBe('arcade-high-score');
  });

  it('lässt Linns Strick-Geschenk einmalig erscheinen und schließt den Faden ab', () => {
    const simulation = storySimulation('knit-gift');
    updateUntil(simulation, () => simulation.activeMoment?.story === 'knit-gift');

    expect(simulation.activeMoment?.kind).toBe('knit-gift');
    expect(simulation.activeMoment?.participantIds).toContain(
      simulation.activeRegulars.find((guest) => guest.regularId === 'linn')?.id,
    );

    updateUntil(simulation, () => simulation.getStoryStage('knit-gift') === 1);
    expect(simulation.stats.storiesCompleted).toBe(1);
  });
});
