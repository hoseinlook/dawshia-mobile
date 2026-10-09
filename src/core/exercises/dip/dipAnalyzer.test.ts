import { dipPose, poseStream } from '../../pose/testing/syntheticPose';
import type { ExerciseEvent } from '../types';
import { DipAnalyzer } from './dipAnalyzer';

function run(waypoints: number[], ms: number) {
  const a = new DipAnalyzer();
  const events: ExerciseEvent[] = [];
  for (const p of poseStream((angle, t) => dipPose(angle, t), waypoints, ms)) events.push(...a.update(p, p.timestampMs).events);
  return {
    reps: events.filter((e) => e.type === 'rep'),
    reasons: events.flatMap((e) => (e.type === 'repRejected' ? [e.reason.code] : [])),
  };
}

describe('DipAnalyzer', () => {
  it('counts deep reps (shoulder below elbow)', () => {
    const { reps, reasons } = run([170, 70, 170, 70, 170], 600);
    expect(reps).toHaveLength(2);
    expect(reasons).toEqual([]);
  });

  it('rejects reps that do not go deep enough', () => {
    expect(run([170, 93, 170], 600).reasons).toEqual(['goDeeper']);
    expect(run([170, 105, 170], 600).reasons).toEqual(['goDeeper']);
  });

  it('rejects reps that are too fast', () => {
    expect(run([170, 70, 170], 200).reasons).toEqual(['tooFast']);
  });

  it('asks to get on the bars when not supported', () => {
    const u = new DipAnalyzer().update(dipPose(170, 0, true), 0);
    expect(u.inPosition).toBe(false);
    expect(u.cues[0].code).toBe('getOnBars');
  });
});
