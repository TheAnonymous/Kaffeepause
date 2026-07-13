import { describe, expect, it } from 'vitest';
import { ReservationManager } from '../src/simulation/reservations';

describe('ReservationManager', () => {
  it('verhindert doppelte Belegung und schützt fremde Reservierungen', () => {
    const reservations = new ReservationManager();
    expect(reservations.reserve('seat-a', 'guest-1')).toBe(true);
    expect(reservations.reserve('seat-a', 'guest-2')).toBe(false);
    expect(reservations.release('seat-a', 'guest-2')).toBe(false);
    expect(reservations.ownerOf('seat-a')).toBe('guest-1');
  });

  it('gibt alle Ziele eines Gastes gemeinsam frei', () => {
    const reservations = new ReservationManager();
    reservations.reserve('seat-a', 'guest-1');
    reservations.reserve('wait-a', 'guest-1');
    reservations.reserve('seat-b', 'guest-2');
    reservations.releaseAll('guest-1');
    expect(reservations.resourcesOf('guest-1')).toEqual([]);
    expect(reservations.ownerOf('seat-b')).toBe('guest-2');
  });
});
