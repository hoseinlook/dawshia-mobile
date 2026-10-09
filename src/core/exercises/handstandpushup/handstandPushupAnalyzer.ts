import { averageElbowAngle, bodyHeights, isInverted } from '../../pose/body';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/** Tunable thresholds for handstand push-ups. Side view, portrait. */
export const HSPU_THRESHOLDS = {
  lockoutElbow: 150,
  bottomElbow: 95,
  descentElbow: 125,
  /** At the bottom, the head must be within this many arm lengths of the hands (floor). */
  maxHeadGap: 0.35,
  minRepMs: 900,
} as const;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  kickUp: { code: 'kickUp', severity: 'info' },
  headToFloor: { code: 'headToFloor', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
} satisfies Record<string, FormCue>;

/**
 * Handstand push-up: inverted with locked arms → lower until the head nearly
 * touches the floor → press back to locked arms.
 */
export class HandstandPushupAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: HSPU_THRESHOLDS.lockoutElbow,
    lowThreshold: HSPU_THRESHOLDS.bottomElbow,
    startZone: 'high',
    minRepMs: HSPU_THRESHOLDS.minRepMs,
  });
  private readonly elbowSmoother = new SignalSmoother(0.6);
  private validReps = 0;
  /** Smallest head-to-hands gap of the rep, in arm lengths. */
  private repMinGap = Infinity;
  private repMaxElbow = 0;
  private partialDescent = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    if (!pose) return this.result(false, events, [CUES.notVisible], {});

    const elbow = this.elbowSmoother.update(averageElbowAngle(pose), timestampMs);
    const metrics: Record<string, number> = {};
    if (elbow === null) return this.result(false, events, [CUES.notVisible], metrics);
    metrics.elbowAngle = Math.round(elbow);

    if (!isInverted(pose)) {
      this.machine.reset();
      this.resetRep();
      return this.result(false, events, [CUES.kickUp], metrics);
    }

    const k = pose.keypoints;
    const h = bodyHeights(pose);
    const arm =
      (Math.hypot((k.leftShoulder.x - k.leftWrist.x) * pose.frameWidth, (k.leftShoulder.y - k.leftWrist.y) * pose.frameHeight) +
        Math.hypot((k.rightShoulder.x - k.rightWrist.x) * pose.frameWidth, (k.rightShoulder.y - k.rightWrist.y) * pose.frameHeight)) /
        2 || 1;
    const fullArm = Math.max(arm, this.lockedArm);
    if (elbow >= HSPU_THRESHOLDS.lockoutElbow) this.lockedArm = Math.max(this.lockedArm, arm);
    const gap = ((h.wrists - h.nose) * pose.frameHeight) / fullArm;
    this.repMinGap = Math.min(this.repMinGap, gap);
    this.repMaxElbow = Math.max(this.repMaxElbow, elbow);

    const before = this.machine.currentPhase;
    const transition = this.machine.update(elbow, timestampMs);

    if (before === 'start' && transition.type === 'none') {
      if (elbow < HSPU_THRESHOLDS.descentElbow) this.partialDescent = true;
      if (this.partialDescent && elbow >= HSPU_THRESHOLDS.lockoutElbow) {
        events.push({ type: 'repRejected', reason: CUES.headToFloor, timestampMs });
        this.resetRep();
      }
    }

    if (transition.type === 'completed') {
      events.push(this.evaluate(transition.durationMs, transition.tooFast, timestampMs));
      this.resetRep();
    } else if (before === 'unknown' && this.machine.currentPhase === 'start') {
      this.resetRep();
    }
    return this.result(true, events, [], metrics);
  }

  /** Longest shoulder-to-wrist distance seen with locked arms (scale reference). */
  private lockedArm = 0;

  reset(): void {
    this.machine.reset();
    this.elbowSmoother.reset();
    this.validReps = 0;
    this.lockedArm = 0;
    this.resetRep();
  }

  private evaluate(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    if (this.repMinGap > HSPU_THRESHOLDS.maxHeadGap) return { type: 'repRejected', reason: CUES.headToFloor, timestampMs };
    const depth = linearScore(-this.repMinGap, -HSPU_THRESHOLDS.maxHeadGap, -0.1);
    const lockout = linearScore(this.repMaxElbow, HSPU_THRESHOLDS.lockoutElbow, 168);
    const quality = 0.6 * (0.5 + 0.5 * depth) + 0.4 * (0.5 + 0.5 * lockout);
    this.validReps += 1;
    return { type: 'rep', repNumber: this.validReps, quality: Math.round(quality * 100) / 100, durationMs, timestampMs };
  }

  private resetRep(): void {
    this.repMinGap = Infinity;
    this.repMaxElbow = 0;
    this.partialDescent = false;
  }

  private result(inPosition: boolean, events: ExerciseEvent[], cues: FormCue[], metrics: Record<string, number>): ExerciseUpdate {
    const phase = this.machine.currentPhase;
    return { inPosition, phase: phase === 'far' ? 'down' : phase === 'start' ? 'up' : 'unknown', events, cues, metrics };
  }
}
