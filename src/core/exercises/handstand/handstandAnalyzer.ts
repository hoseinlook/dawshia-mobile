import { inclinationFromHorizontal, jointAngle } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from '../types';

/** Tunable thresholds for handstand detection. Front or side view, portrait. */
export const HANDSTAND_THRESHOLDS = {
  /** Elbow angle that counts as locked arms. */
  lockedElbow: 150,
  /** Shoulder→ankle line must be at least this steep (90 = vertical). */
  minBodyIncline: 60,
  /** Short drops in detection are ignored for this long before the hold counts as broken. */
  graceMs: 600,
} as const;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  kickUp: { code: 'kickUp', severity: 'info' },
  lockArms: { code: 'lockArms', severity: 'warning' },
  straightBody: { code: 'straightBody', severity: 'warning' },
} satisfies Record<string, FormCue>;

/**
 * Handstand hold detector. `inPosition` = currently holding a valid handstand:
 * inverted (feet above the head), hands under the shoulders, arms locked and
 * the body close to vertical. Brief detection drops (< graceMs) don't break it.
 * `metrics.holdMs` is the length of the current continuous hold.
 */
export class HandstandAnalyzer implements ExerciseAnalyzer {
  private readonly elbowSmoother = new SignalSmoother(0.5);
  private holdStartedAt: number | null = null;
  private lastValidAt = -Infinity;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    let valid = false;
    let cue: FormCue | null = CUES.notVisible;
    const metrics: Record<string, number> = {};

    if (pose) {
      const k = pose.keypoints;
      const left = jointAngle(pose, 'leftShoulder', 'leftElbow', 'leftWrist');
      const right = jointAngle(pose, 'rightShoulder', 'rightElbow', 'rightWrist');
      const arms = [left, right].filter((a): a is number => a !== null);
      const elbow = this.elbowSmoother.update(
        arms.length ? arms.reduce((a, b) => a + b, 0) / arms.length : null,
        timestampMs,
      );

      const avg = (a: number, b: number) => (a + b) / 2;
      const headY = Math.min(k.nose.y, avg(k.leftShoulder.y, k.rightShoulder.y));
      const feetY = Math.min(avg(k.leftAnkle.y, k.rightAnkle.y), avg(k.leftKnee.y, k.rightKnee.y));
      const shouldersY = avg(k.leftShoulder.y, k.rightShoulder.y);
      const handsY = avg(k.leftWrist.y, k.rightWrist.y);
      const incline = Math.max(
        inclinationFromHorizontal(pose, 'leftShoulder', 'leftAnkle') ?? 0,
        inclinationFromHorizontal(pose, 'rightShoulder', 'rightAnkle') ?? 0,
      );

      // y grows downward: inverted = feet above the head; hands on the floor below the shoulders.
      const inverted = feetY < headY && handsY > shouldersY;
      if (elbow !== null) metrics.elbowAngle = Math.round(elbow);
      metrics.incline = Math.round(incline);

      if (elbow === null) cue = CUES.notVisible;
      else if (!inverted) cue = CUES.kickUp;
      else if (elbow < HANDSTAND_THRESHOLDS.lockedElbow) cue = CUES.lockArms;
      else if (incline < HANDSTAND_THRESHOLDS.minBodyIncline) cue = CUES.straightBody;
      else {
        valid = true;
        cue = null;
      }
    }

    if (valid) {
      this.lastValidAt = timestampMs;
      this.holdStartedAt ??= timestampMs;
    } else if (this.holdStartedAt !== null && timestampMs - this.lastValidAt > HANDSTAND_THRESHOLDS.graceMs) {
      this.holdStartedAt = null; // hold broken
    }

    const holding = this.holdStartedAt !== null;
    if (holding) metrics.holdMs = this.lastValidAt - this.holdStartedAt!;

    return {
      inPosition: holding,
      phase: holding ? 'hold' : 'off',
      events: [],
      cues: holding || !cue ? [] : [cue],
      metrics,
    };
  }

  reset(): void {
    this.elbowSmoother.reset();
    this.holdStartedAt = null;
    this.lastValidAt = -Infinity;
  }
}
