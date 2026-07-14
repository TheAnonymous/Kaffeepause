import { describe, expect, it } from 'vitest';
import { calculateDioramaLook } from '../src/diorama/look';
import { DIORAMA_SCALE_REPORT, validateDioramaScale, worldToDiorama } from '../src/diorama/types';

describe('physical diorama scale', () => {
  it('keeps people, furniture, door and walkways in one scale system', () => {
    expect(DIORAMA_SCALE_REPORT.valid).toBe(true);
    expect(DIORAMA_SCALE_REPORT.score).toBe(100);
    expect(validateDioramaScale().issues).toEqual([]);
  });

  it('maps simulation coordinates monotonically into the physical floor', () => {
    const backLeft = worldToDiorama({ x: 0, y: 130 });
    const frontRight = worldToDiorama({ x: 384, y: 216 });
    expect(backLeft).toEqual({ x: -8, z: -3.6 });
    expect(frontRight).toEqual({ x: 8, z: 3.6 });
  });
});

describe('diorama look direction', () => {
  it('gives the neon venue more bloom than the café under the same default light', () => {
    expect(calculateDioramaLook('arcade').bloom).toBeGreaterThan(calculateDioramaLook('cafe').bloom);
  });
});

