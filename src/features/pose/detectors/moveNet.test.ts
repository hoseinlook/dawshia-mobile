import { KEYPOINT_NAMES } from '../../../core/pose/types';
import { frameToViewPoint } from '../mapToView';
import { decodeMoveNet } from './moveNet';

jest.mock('../../../../assets/models/movenet_lightning_f16.tflite', () => 1, { virtual: true });

function output(points: [number, number, number][]): Float32Array {
  const out = new Float32Array(KEYPOINT_NAMES.length * 3);
  points.forEach(([y, x, s], i) => out.set([y, x, s], i * 3));
  return out;
}

describe('decodeMoveNet', () => {
  it('removes letterbox bars for a landscape frame', () => {
    // 1280x720 letterboxed into a square: content spans y ∈ [0.21875, 0.78125].
    const kp = decodeMoveNet(output([[0.5, 0.25, 0.9], [0.21875, 1, 0.8]]), 1280, 720);
    expect(kp.nose).toEqual({ x: 0.25, y: 0.5, score: expect.closeTo(0.9, 5) });
    expect(kp.leftEye.x).toBeCloseTo(1);
    expect(kp.leftEye.y).toBeCloseTo(0);
  });

  it('removes letterbox bars for a portrait frame', () => {
    const kp = decodeMoveNet(output([[0.5, 0.21875, 1]]), 720, 1280);
    expect(kp.nose.x).toBeCloseTo(0);
    expect(kp.nose.y).toBeCloseTo(0.5);
  });
});

describe('frameToViewPoint', () => {
  it('maps through cover scaling', () => {
    // 1280x720 frame on a 800x800 view: scaled to 1422x800, cropped 311px each side.
    const p = frameToViewPoint(0.5, 0.5, { width: 1280, height: 720 }, { width: 800, height: 800 });
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(400);
    const left = frameToViewPoint(0, 0, { width: 1280, height: 720 }, { width: 800, height: 800 });
    expect(left.x).toBeCloseTo(-311.11, 1);
    expect(left.y).toBeCloseTo(0);
  });
});
