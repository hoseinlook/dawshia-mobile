import { averageElbowAngle, bodyHeights } from '../../pose/body';
import { inclinationFromHorizontal, jointAngle, mostVisibleSide, sideKeypoint } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { HoldAnalyzer, NOT_VISIBLE, type HoldCheck } from '../holdAnalyzer';
import type { FormCue } from '../types';

/** Tunable thresholds for the front lever. Side view. */
export const FRONTLEVER_THRESHOLDS = {
  lockedElbow: 150,
  /** Shoulder-hip-ankle angle at least this (straight body, no pike). */
  minBodyLine: 155,
  /** Shoulder→ankle line at most this far from horizontal. */
  maxBodyIncline: 20,
} as const;

const CUES = {
  getOnBar: { code: 'getOnBar', severity: 'info' },
  lockArms: { code: 'lockArms', severity: 'warning' },
  straightBody: { code: 'straightBody', severity: 'warning' },
  raiseBody: { code: 'raiseBody', severity: 'warning' },
} satisfies Record<string, FormCue>;

const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;

/** Front lever hold: hanging on locked arms, body straight and horizontal. */
export class FrontleverAnalyzer extends HoldAnalyzer {
  constructor() {
    const elbowSmoother = new SignalSmoother(0.5);
    super(
      (pose: Pose, timestampMs: number): HoldCheck => {
        const side = mostVisibleSide(pose, JOINTS);
        const k = (joint: string) => sideKeypoint(side, joint);
        const elbow = elbowSmoother.update(averageElbowAngle(pose), timestampMs);
        const line = jointAngle(pose, k('shoulder'), k('hip'), k('ankle'));
        const incline = inclinationFromHorizontal(pose, k('shoulder'), k('ankle'));
        const metrics: Record<string, number> = {};
        if (elbow === null || line === null || incline === null) return { valid: false, cue: NOT_VISIBLE, metrics };
        metrics.elbowAngle = Math.round(elbow);
        metrics.bodyLine = Math.round(line);
        metrics.incline = Math.round(incline);

        const h = bodyHeights(pose);
        // Hanging: hands on the bar above the shoulders.
        if (h.wrists >= h.shoulders) return { valid: false, cue: CUES.getOnBar, metrics };
        if (elbow < FRONTLEVER_THRESHOLDS.lockedElbow) return { valid: false, cue: CUES.lockArms, metrics };
        if (line < FRONTLEVER_THRESHOLDS.minBodyLine) return { valid: false, cue: CUES.straightBody, metrics };
        if (incline > FRONTLEVER_THRESHOLDS.maxBodyIncline) return { valid: false, cue: CUES.raiseBody, metrics };
        return { valid: true, cue: null, metrics };
      },
      () => elbowSmoother.reset(),
    );
  }
}
