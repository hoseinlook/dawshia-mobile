import { handstandPose, poseStream } from '../../pose/testing/syntheticPose';
import type { ExerciseEvent } from '../types';
import { HandstandPushupAnalyzer } from './handstandPushupAnalyzer';

function run(waypoints: number[], ms: number, headOffset = 90) {
  const a = new HandstandPushupAnalyzer();
  const events: ExerciseEvent[] = [];
  for (const p of poseStream((angle, t) => handstandPose({ elbowAngle: angle, headOffset, timestampMs: t }), waypoints, ms)) {
    events.push(...a.update(p, p.timestampMs).events);
  }
  return {
    reps: events.filter((e) => e.type === 'rep'),
    reasons: events.flatMap((e) => (e.type === 'repRejected' ? [e.reason.code] : [])),
  };
}

describe('HandstandPushupAnalyzer', () => {
  it('counts full reps: locked → head near the floor → locked', () => {
    const { reps, reasons } = run([175, 80, 175, 80, 175], 900);
    expect(reps).toHaveLength(2);
    expect(reasons).toEqual([]);
  });

  it('rejects reps where the head stays high', () => {
    expect(run([175, 80, 175], 900, 30).reasons).toEqual(['headToFloor']);
  });

  it('rejects half reps', () => {
    expect(run([175, 110, 175], 900).reasons).toEqual(['headToFloor']);
  });

  it('asks to kick up when not inverted', () => {
    const u = new HandstandPushupAnalyzer().update(handstandPose({ standing: true }), 0);
    expect(u.inPosition).toBe(false);
    expect(u.cues[0].code).toBe('kickUp');
  });
});
