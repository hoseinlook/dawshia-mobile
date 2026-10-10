import { frontPushupPose } from '../../pose/testing/syntheticPose';
import { FlappyAnalyzer } from './flappyAnalyzer';

/** Feeds ~30 fps frames at a fixed depth and returns the last update. */
function hold(a: FlappyAnalyzer, depth: number, fromMs: number, toMs: number, scale = 1) {
  let u = a.update(frontPushupPose({ depth, scale, timestampMs: fromMs }), fromMs);
  for (let t = fromMs + 33; t < toMs; t += 33) u = a.update(frontPushupPose({ depth, scale, timestampMs: t }), t);
  return u;
}

describe('FlappyAnalyzer (face to face)', () => {
  it('turns push-up height into bird height while in a plank', () => {
    const a = new FlappyAnalyzer();
    const top = hold(a, 0, 0, 500);
    expect(top.inPosition).toBe(true);
    expect(top.metrics.birdY).toBeLessThan(0.2);

    const middle = hold(a, 0.5, 500, 1000);
    expect(middle.metrics.birdY).toBeGreaterThan(0.35);
    expect(middle.metrics.birdY).toBeLessThan(0.65);

    const bottom = hold(a, 1, 1000, 1500);
    expect(bottom.inPosition).toBe(true);
    expect(bottom.metrics.birdY).toBeGreaterThan(0.8);

    expect(hold(a, 0, 1500, 2000).metrics.birdY).toBeLessThan(0.2);
  });

  it('works at any distance from the phone', () => {
    for (const scale of [0.6, 1.4]) {
      const a = new FlappyAnalyzer();
      expect(hold(a, 0, 0, 400, scale).metrics.birdY).toBeLessThan(0.2);
      expect(hold(a, 1, 400, 900, scale).metrics.birdY).toBeGreaterThan(0.8);
    }
  });

  it('keeps the calibration when the game starts', () => {
    const a = new FlappyAnalyzer();
    hold(a, 0, 0, 500);
    a.reset();
    // First frame of the game already at the bottom: the bird must be low, not recalibrated to "top".
    expect(hold(a, 1, 600, 900).metrics.birdY).toBeGreaterThan(0.8);
  });

  it('is out of position when standing up', () => {
    const u = new FlappyAnalyzer().update(frontPushupPose({ depth: 0, standing: true }), 0);
    expect(u.inPosition).toBe(false);
    expect(u.cues[0].code).toBe('getInPlank');
  });

  it('asks to be visible when the shoulders are not seen', () => {
    expect(new FlappyAnalyzer().update(null, 0).cues[0].code).toBe('notVisible');
  });
});
