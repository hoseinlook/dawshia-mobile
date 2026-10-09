import { averageElbowAngle, bodyHeights } from '../../pose/body';
import { inclinationFromHorizontal, mostVisibleSide, sideKeypoint } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/** Tunable thresholds for deep parallel-bar dips. Side view, portrait. */
export const DIP_THRESHOLDS = {
  /** Elbow angle that counts as locked out at the top. */
  lockoutElbow: 150,
  /** Elbow angle that must be reached at the bottom. */
  bottomElbow: 95,
  /** Below this the athlete has started going down (for half-rep detection). */
  descentElbow: 125,
  /** Shoulder→hip line at least this steep (upright on the bars). */
  minTorsoIncline: 50,
  minRepMs: 600,
} as const;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  getOnBars: { code: 'getOnBars', severity: 'info' },
  goDeeper: { code: 'goDeeper', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
} satisfies Record<string, FormCue>;

const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip'] as const;

/**
 * Deep dip: locked out → down until the shoulder is at or below the elbow
 * (the "deep" standard) → locked out again.
 */
export class DipAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: DIP_THRESHOLDS.lockoutElbow,
    lowThreshold: DIP_THRESHOLDS.bottomElbow,
    startZone: 'high',
    minRepMs: DIP_THRESHOLDS.minRepMs,
  });
  private readonly elbowSmoother = new SignalSmoother(0.6);
  private validReps = 0;
  /** Deepest point of the rep: shoulder below elbow, in upper-arm lengths (≥ 0 = deep). */
  private repMaxDepth = -Infinity;
  private repMaxElbow = 0;
  private partialDescent = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    if (!pose) return this.result(false, events, [CUES.notVisible], {});

    const side = mostVisibleSide(pose, JOINTS);
    const k = (joint: string) => sideKeypoint(side, joint);
    const elbow = this.elbowSmoother.update(averageElbowAngle(pose), timestampMs);
    const torso = inclinationFromHorizontal(pose, k('shoulder'), k('hip'));
    const metrics: Record<string, number> = {};
    if (elbow === null || torso === null) return this.result(false, events, [CUES.notVisible], metrics);
    metrics.elbowAngle = Math.round(elbow);

    const h = bodyHeights(pose);
    const supported = h.wrists > h.shoulders && torso >= DIP_THRESHOLDS.minTorsoIncline;
    if (!supported) {
      this.machine.reset();
      this.resetRep();
      return this.result(false, events, [CUES.getOnBars], metrics);
    }

    const s = pose.keypoints[k('shoulder')];
    const e = pose.keypoints[k('elbow')];
    const upperArm = Math.hypot((s.x - e.x) * pose.frameWidth, (s.y - e.y) * pose.frameHeight) || 1;
    const depth = ((s.y - e.y) * pose.frameHeight) / upperArm; // y grows downward
    this.repMaxDepth = Math.max(this.repMaxDepth, depth);
    this.repMaxElbow = Math.max(this.repMaxElbow, elbow);

    const before = this.machine.currentPhase;
    const transition = this.machine.update(elbow, timestampMs);

    if (before === 'start' && transition.type === 'none') {
      if (elbow < DIP_THRESHOLDS.descentElbow) this.partialDescent = true;
      if (this.partialDescent && elbow >= DIP_THRESHOLDS.lockoutElbow) {
        events.push({ type: 'repRejected', reason: CUES.goDeeper, timestampMs });
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

  reset(): void {
    this.machine.reset();
    this.elbowSmoother.reset();
    this.validReps = 0;
    this.resetRep();
  }

  private evaluate(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    if (this.repMaxDepth < 0) return { type: 'repRejected', reason: CUES.goDeeper, timestampMs };
    const depth = linearScore(this.repMaxDepth, 0, 0.4);
    const lockout = linearScore(this.repMaxElbow, DIP_THRESHOLDS.lockoutElbow, 168);
    const quality = 0.6 * (0.5 + 0.5 * depth) + 0.4 * (0.5 + 0.5 * lockout);
    this.validReps += 1;
    return { type: 'rep', repNumber: this.validReps, quality: Math.round(quality * 100) / 100, durationMs, timestampMs };
  }

  private resetRep(): void {
    this.repMaxDepth = -Infinity;
    this.repMaxElbow = 0;
    this.partialDescent = false;
  }

  private result(inPosition: boolean, events: ExerciseEvent[], cues: FormCue[], metrics: Record<string, number>): ExerciseUpdate {
    const phase = this.machine.currentPhase;
    return { inPosition, phase: phase === 'far' ? 'down' : phase === 'start' ? 'up' : 'unknown', events, cues, metrics };
  }
}
