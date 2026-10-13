import { frontPushupPose } from '../../pose/testing/syntheticPose';
import { FLAPPY_PLANK_GRACE_MS, FlappyAnalyzer } from './flappyAnalyzer';

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

    const bottom = hold(a, 1, 500, 1000);
    expect(bottom.inPosition).toBe(true);
    expect(bottom.metrics.birdY).toBeGreaterThan(0.8);

    // Halfway down a full push-up = the middle of the field.
    const middle = hold(a, 0.5, 1000, 1500);
    expect(middle.metrics.birdY).toBeGreaterThan(0.35);
    expect(middle.metrics.birdY).toBeLessThan(0.65);

    expect(hold(a, 0, 1500, 2000).metrics.birdY).toBeLessThan(0.2);
  });

  it('reaches the bottom when full push-ups look shallow to the camera', () => {
    // A phone above the floor sees the shoulders drop to only ~60% of the top.
    const a = new FlappyAnalyzer();
    let lowest = 0;
    for (let rep = 0; rep < 3; rep++) {
      hold(a, 0, rep * 2000, rep * 2000 + 1000);
      lowest = hold(a, 0.5, rep * 2000 + 1000, rep * 2000 + 2000).metrics.birdY;
    }
    expect(lowest).toBeGreaterThan(0.8);
  });

  it('learns the bottom back up when push-ups stop being as deep', () => {
    const a = new FlappyAnalyzer();
    hold(a, 0, 0, 500);
    hold(a, 1, 500, 1000); // one very deep rep
    let u = hold(a, 0, 1000, 2000);
    for (let rep = 0; rep < 10; rep++) {
      hold(a, 0, 2000 + rep * 2000, 3000 + rep * 2000);
      u = hold(a, 0.6, 3000 + rep * 2000, 4000 + rep * 2000);
    }
    expect(u.metrics.birdY).toBeGreaterThan(0.8);
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

  it('keeps the plank and the bird height through a few lost frames', () => {
    const a = new FlappyAnalyzer();
    const before = hold(a, 0.5, 0, 500);
    const lost = a.update(null, 600);
    expect(lost.inPosition).toBe(true);
    expect(lost.metrics.birdY).toBeCloseTo(before.metrics.birdY, 5);
    expect(a.update(null, 500 + FLAPPY_PLANK_GRACE_MS + 50).inPosition).toBe(false);
  });

  it('uses the remembered hands when the wrists are not detected', () => {
    const a = new FlappyAnalyzer();
    hold(a, 0, 0, 500);
    let u = a.update(frontPushupPose({ depth: 1, timestampMs: 2000 }), 2000);
    for (let t = 2033; t < 2500; t += 33) {
      const pose = frontPushupPose({ depth: 1, timestampMs: t });
      pose.keypoints.leftWrist.score = 0;
      pose.keypoints.rightWrist.score = 0;
      u = a.update(pose, t);
    }
    expect(u.inPosition).toBe(true);
    expect(u.metrics.birdY).toBeGreaterThan(0.8);
  });

  it('leaves the plank after standing up for longer than the grace period', () => {
    const a = new FlappyAnalyzer();
    hold(a, 0, 0, 500);
    let u = a.update(frontPushupPose({ depth: 0, standing: true, timestampMs: 533 }), 533);
    expect(u.inPosition).toBe(true);
    u = a.update(
      frontPushupPose({ depth: 0, standing: true, timestampMs: 500 + FLAPPY_PLANK_GRACE_MS + 50 }),
      500 + FLAPPY_PLANK_GRACE_MS + 50,
    );
    expect(u.inPosition).toBe(false);
    expect(u.cues[0].code).toBe('getInPlank');
  });
});
