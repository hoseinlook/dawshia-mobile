import { sideViewPose } from '../../pose/testing/syntheticPose';
import { FlappyAnalyzer } from './flappyAnalyzer';

describe('FlappyAnalyzer', () => {
  it('turns push-up height into bird height while in a plank', () => {
    const a = new FlappyAnalyzer();
    let top = a.update(sideViewPose({ elbowAngle: 170 }), 0);
    for (let t = 33; t < 400; t += 33) top = a.update(sideViewPose({ elbowAngle: 170, timestampMs: t }), t);
    expect(top.inPosition).toBe(true);
    expect(top.metrics.birdY).toBeLessThan(0.2);

    let bottom = top;
    for (let t = 400; t < 900; t += 33) bottom = a.update(sideViewPose({ elbowAngle: 85, timestampMs: t }), t);
    expect(bottom.metrics.birdY).toBeGreaterThan(0.8);
  });

  it('is out of position when standing up', () => {
    const u = new FlappyAnalyzer().update(sideViewPose({ elbowAngle: 170, shoulderLift: 700 }), 0);
    expect(u.inPosition).toBe(false);
    expect(u.cues[0].code).toBe('getInPlank');
  });
});
