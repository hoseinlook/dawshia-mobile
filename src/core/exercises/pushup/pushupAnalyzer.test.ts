import { elbowAngleStream, sideViewPose } from '../../pose/testing/syntheticPose';
import type { ExerciseEvent } from '../types';
import { PushupAnalyzer } from './pushupAnalyzer';

function run(poses: ReturnType<typeof elbowAngleStream>) {
  const analyzer = new PushupAnalyzer();
  const events: ExerciseEvent[] = [];
  let lastInPosition = false;
  for (const pose of poses) {
    const update = analyzer.update(pose, pose.timestampMs);
    events.push(...update.events);
    lastInPosition = update.inPosition;
  }
  return {
    reps: events.filter((e) => e.type === 'rep'),
    rejected: events.filter((e) => e.type === 'repRejected'),
    lastInPosition,
  };
}

describe('PushupAnalyzer', () => {
  it('counts full-range reps', () => {
    const { reps, rejected } = run(
      elbowAngleStream([170, 80, 170, 80, 170, 80, 170, 80, 170, 80, 170], 500),
    );
    expect(reps).toHaveLength(5);
    expect(rejected).toHaveLength(0);
    expect(reps.map((r) => (r.type === 'rep' ? r.repNumber : 0))).toEqual([1, 2, 3, 4, 5]);
    for (const r of reps) if (r.type === 'rep') expect(r.quality).toBeGreaterThan(0.8);
  });

  it('rejects half reps that do not reach the bottom', () => {
    const { reps, rejected } = run(elbowAngleStream([170, 120, 170, 120, 170], 500));
    expect(reps).toHaveLength(0);
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    for (const r of rejected) if (r.type === 'repRejected') expect(r.reason.code).toBe('goLower');
  });

  it('rejects reps that are too fast', () => {
    const { reps, rejected } = run(elbowAngleStream([170, 80, 170], 120));
    expect(reps).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    if (rejected[0].type === 'repRejected') expect(rejected[0].reason.code).toBe('tooFast');
  });

  it('rejects reps with sagging hips', () => {
    const { reps, rejected } = run(elbowAngleStream([170, 80, 170], 500, { hipOffset: 120 }));
    expect(reps).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    if (rejected[0].type === 'repRejected') expect(rejected[0].reason.code).toBe('hipsSag');
  });

  it('does not count while the body is not horizontal', () => {
    const { reps, lastInPosition } = run(
      elbowAngleStream([170, 80, 170, 80, 170], 500, { shoulderLift: 700 }),
    );
    expect(reps).toHaveLength(0);
    expect(lastInPosition).toBe(false);
  });

  it('reports not visible when no pose is detected', () => {
    const analyzer = new PushupAnalyzer();
    const update = analyzer.update(null, 0);
    expect(update.inPosition).toBe(false);
    expect(update.cues[0].code).toBe('notVisible');
  });

  it('is in position during a straight plank', () => {
    const analyzer = new PushupAnalyzer();
    const update = analyzer.update(sideViewPose({ elbowAngle: 170 }), 0);
    expect(update.inPosition).toBe(true);
    expect(update.metrics.elbowAngle).toBeCloseTo(170, 0);
  });
});
