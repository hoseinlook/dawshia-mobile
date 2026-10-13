import { averageElbowAngle, bodyHeights } from '../../pose/body';
import { inclinationFromHorizontal, mostVisibleSide, sideKeypoint } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { HoldAnalyzer, NOT_VISIBLE, type HoldCheck } from '../holdAnalyzer';
import type { FormCue } from '../types';

/** Tunable thresholds for the L-sit. Side view. */
export const LSIT_THRESHOLDS = {
  lockedElbow: 150,
  /** Shoulder→hip line at least this steep (torso upright). */
  minTorsoIncline: 55,
  /** Legs may drop at most this far below horizontal (higher legs, toward a V-sit, are fine). */
  maxLegDrop: 25,
} as const;

const CUES = {
  pressUp: { code: 'pressUp', severity: 'info' },
  lockArms: { code: 'lockArms', severity: 'warning' },
  sitUpright: { code: 'sitUpright', severity: 'warning' },
  liftLegs: { code: 'liftLegs', severity: 'warning' },
} satisfies Record<string, FormCue>;

const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;

/** L-sit hold: supported on locked arms, torso upright, legs straight out and horizontal. */
export class LsitAnalyzer extends HoldAnalyzer {
  constructor() {
    const elbowSmoother = new SignalSmoother(0.5);
    super(
      (pose: Pose, timestampMs: number): HoldCheck => {
        const side = mostVisibleSide(pose, JOINTS);
        const k = (joint: string) => sideKeypoint(side, joint);
        const elbow = elbowSmoother.update(averageElbowAngle(pose), timestampMs);
        const torso = inclinationFromHorizontal(pose, k('shoulder'), k('hip'));
        const legs = inclinationFromHorizontal(pose, k('hip'), k('ankle'));
        const metrics: Record<string, number> = {};
        if (elbow === null || torso === null || legs === null) return { valid: false, cue: NOT_VISIBLE, metrics };
        metrics.elbowAngle = Math.round(elbow);
        // Signed: positive when the feet are below the hips (y grows downward).
        const legsDropping = pose.keypoints[k('ankle')].y > pose.keypoints[k('hip')].y;
        const legDrop = legsDropping ? legs : -legs;
        metrics.legDrop = Math.round(legDrop);

        const h = bodyHeights(pose);
        // Support: hands below the shoulders (pressing down on the floor or parallettes).
        if (h.wrists <= h.shoulders) return { valid: false, cue: CUES.pressUp, metrics };
        if (elbow < LSIT_THRESHOLDS.lockedElbow) return { valid: false, cue: CUES.lockArms, metrics };
        if (torso < LSIT_THRESHOLDS.minTorsoIncline) return { valid: false, cue: CUES.sitUpright, metrics };
        if (legDrop > LSIT_THRESHOLDS.maxLegDrop) return { valid: false, cue: CUES.liftLegs, metrics };
        return { valid: true, cue: null, metrics };
      },
      () => elbowSmoother.reset(),
    );
  }
}
