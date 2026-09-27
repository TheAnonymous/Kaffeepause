import { describe, expect, it } from 'vitest';
import { CafeSimulation, friendProfile } from '../src/simulation/cafeSimulation';
import type { Friend } from '../src/friends';

const sam: Friend = {
  name: 'Sam', venue: 'cafe', activity: 'knitting',
  hair: 'curls', hairColor: '#3a2a22', outfit: 'hoodie', outfitColor: '#4f7c68', detail: 'glasses',
};

describe('Freunde als Stammgäste', () => {
  it('übernimmt Aussehen und Beschäftigung aus der Freundesliste', () => {
    const profile = friendProfile(sam);
    expect(profile.id).toBe('friend:sam');
    expect(profile.palette).toMatchObject({ hair: '#3a2a22', coat: '#4f7c68' });
    expect(profile.appearance).toMatchObject({ hair: 'curls', outfit: 'hoodie', detail: 'glasses' });
    expect(profile.favoriteActivity).toBe('knitting');
  });

  it('ergänzt fehlende Angaben stabil aus dem Namen', () => {
    const minimal: Friend = { name: 'Jo', venue: 'arcade', activity: 'typing' };
    expect(friendProfile(minimal)).toEqual(friendProfile(minimal));
    expect(friendProfile({ ...minimal, name: 'Jö Müller' }).id).toBe('friend:jo-muller');
  });

  it('lässt Freunde als Erste im Lieblingsort Platz nehmen', () => {
    const simulation = new CafeSimulation({
      seed: 5, venue: 'cafe', initialGuests: 4, minGuests: 0, maxGuests: 4,
      accidents: false, moments: false, stories: false, friends: [sam],
    });
    simulation.start();
    const guest = simulation.guests.find((entry) => entry.regularId === 'friend:sam');
    expect(guest?.name).toBe('Sam');
    expect(guest?.activity).toBe('knitting');
  });

  it('bringt Freunde nicht in einen fremden Ort', () => {
    const simulation = new CafeSimulation({
      seed: 5, venue: 'ramen', initialGuests: 5, minGuests: 0, maxGuests: 5,
      accidents: false, moments: false, stories: false, friends: [sam],
    });
    simulation.start();
    expect(simulation.guests.some((entry) => entry.regularId === 'friend:sam')).toBe(false);
  });

  it('lässt nur Freunde mit diesem Wunsch GameBoy spielen', () => {
    const simulation = new CafeSimulation({
      seed: 9, venue: 'cafe', initialGuests: 6, minGuests: 0, maxGuests: 6,
      accidents: false, moments: false, stories: false,
      friends: [{ name: 'Charles', venue: 'cafe', activity: 'handheld' }],
    });
    simulation.start();
    for (let step = 0; step < 3_000; step += 1) {
      simulation.update(0.1);
      for (const guest of simulation.guests) {
        if (guest.activity === 'handheld') expect(guest.regularId).toBe('friend:charles');
      }
    }
    expect(simulation.guests.some((guest) => guest.regularId === 'friend:charles') || simulation.stats.departures > 0).toBe(true);
  });
});
