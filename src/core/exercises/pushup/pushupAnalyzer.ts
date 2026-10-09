import {
  inclinationFromHorizontal,
  jointAngle,
  mostVisibleSide,
  sideKeypoint,
} from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { BodySide, Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/** Tunable thresholds for push-up detection (degrees / ms). */
export const PUSHUP_THRESHOLDS = {
  /** Elbow angle that counts as arms locked out at the top. */
  lockoutElbow: 150,
  /** Elbow angle that must be reached at the bottom for a valid rep. */
  bottomElbow: 100,
  /** Elbow angle below which we consider the athlete "started going down". */
  descentElbow: 130,
  /** Shoulder→ankle line must be within this many degrees of horizontal. */
  maxBodyIncline: 40,
  /** Shoulder-hip-ankle angle below this = broken body line → rep rejected. */
  minBodyLine: 140,
  /** Shoulder-hip-ankle angle below this triggers a live warning. */
  warnBodyLine: 155,
  minRepMs: 450,
} as const;

const CUES = {
  notVisible: { code: 'notVisible', severity: 'warning' },
  getInPlank: { code: 'getInPlank', severity: 'info' },
  goLower: { code: 'goLower', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
  hipsSag: { code: 'hipsSag', severity: 'warning' },
  hipsPike: { code: 'hipsPike', severity: 'warning' },
} satisfies Record<string, FormCue>;

const SIDE_JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;

interface BodyReading {
  side: BodySide;
  elbow: number | null;
  /** Shoulder-hip-ankle angle (180 = perfectly straight). */
  bodyLine: number | null;
  incline: number | null;
  /** +1 if hips are below the shoulder-ankle line (sagging), -1 if above (piking). */
  hipDeviation: number;
}

function readBody(pose: Pose): BodyReading {
  const side = mostVisibleSide(pose, SIDE_JOINTS);
  const k = (joint: string) => sideKeypoint(side, joint);

  // Ankles are often lost against the floor; fall back to knees.
  const lowerAnchor =
    pose.keypoints[k('ankle')].score >= pose.keypoints[k('knee')].score ? k('ankle') : k('knee');

  const elbow = jointAngle(pose, k('shoulder'), k('elbow'), k('wrist'));
  const bodyLine = jointAngle(pose, k('shoulder'), k('hip'), lowerAnchor);
  const incline = inclinationFromHorizontal(pose, k('shoulder'), lowerAnchor);

  const s = pose.keypoints[k('shoulder')];
  const h = pose.keypoints[k('hip')];
  const a = pose.keypoints[lowerAnchor];
  let hipDeviation = 0;
  if (a.x !== s.x) {
    const t = (h.x - s.x) / (a.x - s.x);
    const lineY = s.y + t * (a.y - s.y);
    hipDeviation = h.y > lineY ? 1 : -1; // y grows downward
  }

  return { side, elbow, bodyLine, incline, hipDeviation };
}

export class PushupAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: PUSHUP_THRESHOLDS.lockoutElbow,
    lowThreshold: PUSHUP_THRESHOLDS.bottomElbow,
    startZone: 'high',
    minRepMs: PUSHUP_THRESHOLDS.minRepMs,
  });
  private readonly elbowSmoother = new SignalSmoother(0.6);
  private readonly bodyLineSmoother = new SignalSmoother(0.4);

  private validReps = 0;
  // Per-rep accumulators.
  private repMinElbow = Infinity;
  private repMaxElbow = 0;
  private repMinBodyLine = Infinity;
  private repWorstHipDeviation = 0;
  /** Went down noticeably while still in 'start' — used to detect half reps. */
  private partialDescent = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    const cues: FormCue[] = [];

    if (pose === null) {
      return this.result(false, events, [CUES.notVisible], {});
    }

    const body = readBody(pose);
    const elbow = this.elbowSmoother.update(body.elbow, timestampMs);
    const bodyLine = this.bodyLineSmoother.update(body.bodyLine, timestampMs);

    const metrics: Record<string, number> = {};
    if (elbow !== null) metrics.elbowAngle = Math.round(elbow);
    if (bodyLine !== null) metrics.bodyLine = Math.round(bodyLine);
    if (body.incline !== null) metrics.incline = Math.round(body.incline);

    if (elbow === null || bodyLine === null || body.incline === null) {
      return this.result(false, events, [CUES.notVisible], metrics);
    }

    const horizontal = body.incline <= PUSHUP_THRESHOLDS.maxBodyIncline;
    if (!horizontal) {
      // Standing up / resting on knees: pause counting, forget the half-done rep.
      this.machine.reset();
      this.resetRepAccumulators();
      return this.result(false, events, [CUES.getInPlank], metrics);
    }

    // Track form across the current rep.
    this.repMinElbow = Math.min(this.repMinElbow, elbow);
    this.repMaxElbow = Math.max(this.repMaxElbow, elbow);
    if (bodyLine < this.repMinBodyLine) {
      this.repMinBodyLine = bodyLine;
      this.repWorstHipDeviation = body.hipDeviation;
    }

    if (bodyLine < PUSHUP_THRESHOLDS.warnBodyLine) {
      cues.push(body.hipDeviation > 0 ? CUES.hipsSag : CUES.hipsPike);
    }

    const before = this.machine.currentPhase;
    const transition = this.machine.update(elbow, timestampMs);

    if (before === 'start' && transition.type === 'none') {
      if (elbow < PUSHUP_THRESHOLDS.descentElbow) this.partialDescent = true;
      if (this.partialDescent && elbow >= PUSHUP_THRESHOLDS.lockoutElbow) {
        // Came back up without reaching the bottom: half rep.
        events.push({ type: 'repRejected', reason: CUES.goLower, timestampMs });
        this.resetRepAccumulators();
      }
    }

    if (transition.type === 'completed') {
      events.push(this.evaluateRep(transition.durationMs, transition.tooFast, timestampMs));
      this.resetRepAccumulators();
    } else if (before === 'unknown' && this.machine.currentPhase === 'start') {
      // First lockout seen: start measuring from here, not from earlier noise.
      this.resetRepAccumulators();
    }

    return this.result(true, events, cues, metrics);
  }

  reset(): void {
    this.machine.reset();
    this.elbowSmoother.reset();
    this.bodyLineSmoother.reset();
    this.validReps = 0;
    this.resetRepAccumulators();
  }

  private evaluateRep(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) {
      return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    }
    if (this.repMinBodyLine < PUSHUP_THRESHOLDS.minBodyLine) {
      const reason = this.repWorstHipDeviation > 0 ? CUES.hipsSag : CUES.hipsPike;
      return { type: 'repRejected', reason, timestampMs };
    }

    const depth = linearScore(-this.repMinElbow, -PUSHUP_THRESHOLDS.bottomElbow, -75);
    const lockout = linearScore(this.repMaxElbow, PUSHUP_THRESHOLDS.lockoutElbow, 168);
    const line = linearScore(this.repMinBodyLine, PUSHUP_THRESHOLDS.minBodyLine, 170);
    const quality = 0.4 * (0.5 + 0.5 * depth) + 0.3 * (0.5 + 0.5 * lockout) + 0.3 * line;

    this.validReps += 1;
    return {
      type: 'rep',
      repNumber: this.validReps,
      quality: Math.round(quality * 100) / 100,
      durationMs,
      timestampMs,
    };
  }

  private resetRepAccumulators(): void {
    this.repMinElbow = Infinity;
    this.repMaxElbow = 0;
    this.repMinBodyLine = Infinity;
    this.repWorstHipDeviation = 0;
    this.partialDescent = false;
  }

  private result(
    inPosition: boolean,
    events: ExerciseEvent[],
    cues: FormCue[],
    metrics: Record<string, number>,
  ): ExerciseUpdate {
    const phase = this.machine.currentPhase;
    return {
      inPosition,
      phase: phase === 'far' ? 'down' : phase === 'start' ? 'up' : 'unknown',
      events,
      cues,
      metrics,
    };
  }
}
