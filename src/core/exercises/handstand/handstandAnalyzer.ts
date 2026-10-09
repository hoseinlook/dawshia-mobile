import { averageElbowAngle, isInverted } from '../../pose/body';
import { inclinationFromHorizontal } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { HoldAnalyzer, NOT_VISIBLE, type HoldCheck } from '../holdAnalyzer';
import type { FormCue } from '../types';

/** Tunable thresholds for handstand detection. Front or side view, portrait. */
export const HANDSTAND_THRESHOLDS = {
  /** Elbow angle that counts as locked arms. */
  lockedElbow: 150,
  /** Shoulder→ankle line must be at least this steep (90 = vertical). */
  minBodyIncline: 60,
} as const;

const CUES = {
  kickUp: { code: 'kickUp', severity: 'info' },
  lockArms: { code: 'lockArms', severity: 'warning' },
  straightBody: { code: 'straightBody', severity: 'warning' },
} satisfies Record<string, FormCue>;

/**
 * Handstand hold: inverted (feet above the head), hands under the shoulders,
 * arms locked and the body close to vertical.
 */
export class HandstandAnalyzer extends HoldAnalyzer {
  constructor() {
    const elbowSmoother = new SignalSmoother(0.5);
    super(
      (pose: Pose, timestampMs: number): HoldCheck => {
        const elbow = elbowSmoother.update(averageElbowAngle(pose), timestampMs);
        const incline = Math.max(
          inclinationFromHorizontal(pose, 'leftShoulder', 'leftAnkle') ?? 0,
          inclinationFromHorizontal(pose, 'rightShoulder', 'rightAnkle') ?? 0,
        );
        const metrics: Record<string, number> = { incline: Math.round(incline) };
        if (elbow === null) return { valid: false, cue: NOT_VISIBLE, metrics };
        metrics.elbowAngle = Math.round(elbow);
        if (!isInverted(pose)) return { valid: false, cue: CUES.kickUp, metrics };
        if (elbow < HANDSTAND_THRESHOLDS.lockedElbow) return { valid: false, cue: CUES.lockArms, metrics };
        if (incline < HANDSTAND_THRESHOLDS.minBodyIncline) return { valid: false, cue: CUES.straightBody, metrics };
        return { valid: true, cue: null, metrics };
      },
      () => elbowSmoother.reset(),
    );
  }
}
