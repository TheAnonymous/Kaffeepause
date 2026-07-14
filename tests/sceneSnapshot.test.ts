import { describe, expect, it } from 'vitest';
import { CafeSimulation } from '../src/simulation/cafeSimulation';

describe('Szenen-Snapshot', () => {
  it('liefert dem Renderer eine eigenständige Momentaufnahme der Simulation', () => {
    const simulation = new CafeSimulation({
      seed: 27,
      initialGuests: 1,
      minGuests: 0,
      maxGuests: 1,
      accidents: false,
      moments: false,
      stories: false,
    });
    simulation.start();

    const snapshot = simulation.getSceneSnapshot();
    const guest = snapshot.guests[0];
    expect(guest).toBeDefined();
    if (!guest) return;
    const animation = guest.animation;
    const position = { ...guest.position };

    simulation.update(0.1);

    expect(snapshot.guests).not.toBe(simulation.guests);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.guests)).toBe(true);
    expect(Object.isFrozen(guest)).toBe(true);
    expect(Object.isFrozen(guest.position)).toBe(true);
    expect(snapshot.guests[0]?.position).toEqual(position);
    expect(snapshot.guests[0]?.animation).toBe(animation);
    expect(snapshot.regularIds).toContain(guest.regularId);
  });

  it('kopiert Moment-, Unfall- und Geschichtenstatus ohne Referenz auf den Simulationszustand', () => {
    const simulation = new CafeSimulation({ seed: 41, initialGuests: 0, accidents: false, moments: false, stories: false });
    const snapshot = simulation.getSceneSnapshot();

    expect(snapshot.accident).toBeUndefined();
    expect(snapshot.moment).toBeUndefined();
    expect(snapshot.storyStages).toEqual({ sketchbook: 0, 'first-date': 0, 'knit-gift': 0, 'arcade-rivals': 0 });
    expect(snapshot.barista.position).not.toBe(simulation.barista.position);
  });
});
