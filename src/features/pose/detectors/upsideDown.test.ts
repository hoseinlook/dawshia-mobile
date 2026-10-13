import { rotateInput180, selectUpright } from './upsideDown';

describe('upside-down detection', () => {
  it('rotates an RGB image by 180°', () => {
    // 2×2 image: pixels A B / C D → D C / B A
    const img = Uint8Array.from([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(Array.from(rotateInput180(img))).toEqual([4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1]);
  });

  it('keeps the more confident reading, turning the rotated one back', () => {
    const normal = Float32Array.from([0.2, 0.3, 0.2, 0.4, 0.5, 0.2]);
    const rotated = Float32Array.from([0.25, 0.5, 0.9, 0.75, 0.1, 0.8]);
    const chosen = selectUpright(normal, rotated);
    expect(Array.from(chosen).map((v) => Math.round(v * 100) / 100)).toEqual([0.75, 0.5, 0.9, 0.25, 0.9, 0.8]);
    expect(selectUpright(rotated, normal)).toBe(rotated);
  });
});
