import { frontHangPose, poseStream } from '../../pose/testing/syntheticPose';
import type { ExerciseEvent } from '../types';
import { PullupAnalyzer } from './pullupAnalyzer';

const hang = (elbowAngle: number, timestampMs: number) => frontHangPose({ elbowAngle, timestampMs });

function run(poses: ReturnType<typeof poseStream>) {
  const analyzer = new PullupAnalyzer();
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

describe('PullupAnalyzer', () => {
  it('counts full reps: dead hang → chin over bar → dead hang', () => {
    const { reps, reasons } = run(poseStream(hang, [170, 40, 170, 40, 170, 40, 170], 700));
    expect(reps).toHaveLength(3);
    expect(reasons).toEqual([]);
    for (const r of reps) if (r.type === 'rep') expect(r.quality).toBeGreaterThan(0.7);
  });

  it('rejects reps where the chin does not clear the bar', () => {
    const { reps, reasons } = run(poseStream(hang, [170, 80, 170], 700));
    expect(reps).toHaveLength(0);
    expect(reasons).toEqual(['chinOverBar']);
  });

  it('rejects pulling again before reaching a full hang', () => {
    const { reps, reasons } = run(poseStream(hang, [170, 40, 135, 40, 170], 700));
    expect(reasons).toContain('fullHang');
    expect(reps).toHaveLength(1);
  });

  it('rejects reps that are too fast', () => {
    const { reps, reasons } = run(poseStream(hang, [170, 40, 170], 150));
    expect(reps).toHaveLength(0);
    expect(reasons).toEqual(['tooFast']);
  });

  it('is not in position while standing under the bar', () => {
    const { reps, inPosition } = run(
      poseStream((a, t) => frontHangPose({ elbowAngle: a, standing: true, timestampMs: t }), [170, 40, 170], 700),
    );
    expect(reps).toHaveLength(0);
    expect(inPosition).toBe(false);
  });

  it('is in position in a dead hang', () => {
    const update = new PullupAnalyzer().update(hang(170, 0), 0);
    expect(update.inPosition).toBe(true);
    expect(update.metrics.elbowAngle).toBeCloseTo(170, 0);
  });

  it('counts reps with the phone on the floor: hands, bar and hips out of the frame', () => {
    const hidden = ['leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee'] as const;
    const { reps, reasons } = run(
      poseStream((a, t) => frontHangPose({ elbowAngle: a, hidden, timestampMs: t }), [170, 40, 170, 40, 170], 700),
    );
    expect(reps).toHaveLength(2);
    expect(reasons).toEqual([]);
  });

  it('stays on the bar when the athlete leaves the frame for a moment at the top', () => {
    const poses = poseStream(hang, [170, 40, 170], 700).map((p, i, all) =>
      Math.abs(i - Math.floor(all.length / 2)) <= 1 ? null : p,
    );
    const analyzer = new PullupAnalyzer();
    let t = 0;
    const events: ExerciseEvent[] = [];
    for (const pose of poses) {
      t = pose?.timestampMs ?? t + 33;
      events.push(...analyzer.update(pose, t).events);
    }
    expect(events.filter((e) => e.type === 'rep')).toHaveLength(1);
  });
});
