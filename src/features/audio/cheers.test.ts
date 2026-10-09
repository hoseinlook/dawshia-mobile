import { pickNext } from './cheers';

describe('pickNext', () => {
  it('never repeats the previous clip', () => {
    for (let prev = 0; prev < 4; prev++) {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const next = pickNext(4, prev, () => r);
        expect(next).not.toBe(prev);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(4);
      }
    }
  });

  it('handles a single clip and no previous clip', () => {
    expect(pickNext(1, 0)).toBe(0);
    expect(pickNext(3, -1, () => 0.99)).toBe(1);
  });
});
