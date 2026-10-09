import { barPose, poseStream } from '../../pose/testing/syntheticPose';
import type { ExerciseEvent } from '../types';
import { MuscleupAnalyzer } from './muscleupAnalyzer';

const onBar = (height: number, t: number) => barPose(height, t);

function run(poses: ReturnType<typeof poseStream>, analyzer = new MuscleupAnalyzer()) {
  const events: ExerciseEvent[] = [];
  let inPosition = false;
  for (const pose of poses) {
    const update = analyzer.update(pose, pose.timestampMs);
    events.push(...update.events);
    inPosition = update.inPosition;
  }
  const reasons = events.flatMap((e) => (e.type === 'repRejected' ? [e.reason.code] : []));
  return { reps: events.filter((e) => e.type === 'rep'), reasons, inPosition };
}

describe('MuscleupAnalyzer', () => {
  it('counts full reps: dead hang → over the bar → lockout → dead hang', () => {
    const { reps, reasons } = run(poseStream(onBar, [-1, 1, -1, 1, -1], 800));
    expect(reps).toHaveLength(2);
    expect(reasons).toEqual([]);
    for (const r of reps) if (r.type === 'rep') expect(r.quality).toBeGreaterThan(0.7);
  });

  it('does not count a pull-up that never gets over the bar', () => {
    const { reps, reasons } = run(poseStream(onBar, [-1, -0.35, -1], 800));
    expect(reps).toHaveLength(0);
    expect(reasons).toEqual([]);
  });

  it('rejects reps without a lockout at the top', () => {
    const { reps, reasons } = run(poseStream(onBar, [-1, 0.6, -1], 900));
    expect(reps).toHaveLength(0);
    expect(reasons).toEqual(['lockOut']);
  });

  it('rejects going back over the bar without a full hang', () => {
    const { reps, reasons } = run(poseStream(onBar, [-1, 1, -0.4, 1, -1], 800));
    expect(reasons).toContain('fullHang');
    expect(reps).toHaveLength(1);
  });

  it('rejects reps that are too fast', () => {
    const { reps, reasons } = run(poseStream(onBar, [-1, 1, -1, -1], 300));
    expect(reps).toHaveLength(0);
    expect(reasons).toEqual(['tooFast']);
  });

  it('does not count dropping off the bar to the floor', () => {
    const analyzer = new MuscleupAnalyzer();
    run(poseStream(onBar, [-1, -1], 500), analyzer);
    const standing = poseStream((_, t) => barPose(1, 1000 + t, true), [0, 0], 1500);
    const { reps, inPosition } = run(standing, analyzer);
    expect(reps).toHaveLength(0);
    expect(inPosition).toBe(false);
  });

  it('needs a dead hang before it is in position', () => {
    expect(new MuscleupAnalyzer().update(barPose(1, 0, true), 0).inPosition).toBe(false);
    expect(new MuscleupAnalyzer().update(barPose(-1, 0), 0).inPosition).toBe(true);
  });
});
