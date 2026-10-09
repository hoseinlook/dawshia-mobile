import { frontLeverPose, lsitPose } from '../../pose/testing/syntheticPose';
import { FrontleverAnalyzer } from '../frontlever/frontleverAnalyzer';
import type { ExerciseAnalyzer } from '../types';
import { LsitAnalyzer } from './lsitAnalyzer';

function hold(analyzer: ExerciseAnalyzer, pose: (t: number) => ReturnType<typeof lsitPose>, ms: number) {
  let last = analyzer.update(pose(0), 0);
  for (let t = 33; t <= ms; t += 33) last = analyzer.update(pose(t), t);
  return last;
}

describe('LsitAnalyzer', () => {
  it('holds a correct L-sit and measures it', () => {
    const u = hold(new LsitAnalyzer(), (t) => lsitPose({ timestampMs: t }), 3000);
    expect(u.inPosition).toBe(true);
    expect(u.metrics.holdMs).toBeGreaterThanOrEqual(2900);
  });

  it('asks to lift the legs and lock the arms', () => {
    expect(hold(new LsitAnalyzer(), (t) => lsitPose({ legDrop: 45, timestampMs: t }), 500).cues[0].code).toBe('liftLegs');
    expect(hold(new LsitAnalyzer(), (t) => lsitPose({ elbowAngle: 110, timestampMs: t }), 500).cues[0].code).toBe('lockArms');
  });
});

describe('FrontleverAnalyzer', () => {
  it('holds a straight, horizontal front lever', () => {
    const u = hold(new FrontleverAnalyzer(), (t) => frontLeverPose({ timestampMs: t }), 3000);
    expect(u.inPosition).toBe(true);
    expect(u.metrics.holdMs).toBeGreaterThanOrEqual(2900);
  });

  it('asks to raise the body, straighten it and lock the arms', () => {
    expect(hold(new FrontleverAnalyzer(), (t) => frontLeverPose({ drop: 40, timestampMs: t }), 500).cues[0].code).toBe('raiseBody');
    expect(hold(new FrontleverAnalyzer(), (t) => frontLeverPose({ pike: 40, timestampMs: t }), 500).cues[0].code).toBe('straightBody');
    expect(hold(new FrontleverAnalyzer(), (t) => frontLeverPose({ elbowAngle: 110, timestampMs: t }), 500).cues[0].code).toBe('lockArms');
  });

  it('does not count a dead hang', () => {
    expect(hold(new FrontleverAnalyzer(), (t) => frontLeverPose({ drop: 90, timestampMs: t }), 1000).inPosition).toBe(false);
  });
});
