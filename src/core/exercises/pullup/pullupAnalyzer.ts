import { inclinationFromHorizontal, jointAngle } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/** Tunable thresholds for pull-up detection (degrees / ms). Front view. */
export const PULLUP_THRESHOLDS = {
  /** Elbow angle that counts as a full dead hang at the bottom. */
  hangElbow: 150,
  /** Elbow angle that must be reached at the top. */
  topElbow: 90,
  /** Elbow angle above which the athlete is "coming back down" during a rep. */
  returnElbow: 120,
  /** Shoulder→hip line must be at least this steep (90 = vertical). */
  minBodyIncline: 55,
  minRepMs: 600,
} as const;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  getOnBar: { code: 'getOnBar', severity: 'info' },
  chinOverBar: { code: 'chinOverBar', severity: 'warning' },
  fullHang: { code: 'fullHang', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
} satisfies Record<string, FormCue>;

interface BodyReading {
  /** Average elbow angle of the visible arms. */
  elbow: number | null;
  /** Nose height above the bar (wrist line), in pixels. Positive = above the bar. */
  noseAboveBar: number | null;
  hanging: boolean;
}

function readBody(pose: Pose): BodyReading {
  const left = jointAngle(pose, 'leftShoulder', 'leftElbow', 'leftWrist');
  const right = jointAngle(pose, 'rightShoulder', 'rightElbow', 'rightWrist');
  const visible = [left, right].filter((a): a is number => a !== null);
  const elbow = visible.length ? visible.reduce((a, b) => a + b, 0) / visible.length : null;

  const k = pose.keypoints;
  const wristsY = ((k.leftWrist.y + k.rightWrist.y) / 2) * pose.frameHeight;
  const shouldersY = ((k.leftShoulder.y + k.rightShoulder.y) / 2) * pose.frameHeight;
  const noseVisible = k.nose.score >= 0.3;
  const noseAboveBar = noseVisible ? wristsY - k.nose.y * pose.frameHeight : null;

  const leftIncline = inclinationFromHorizontal(pose, 'leftShoulder', 'leftHip');
  const rightIncline = inclinationFromHorizontal(pose, 'rightShoulder', 'rightHip');
  const incline = Math.max(leftIncline ?? 0, rightIncline ?? 0);
  // Hanging = hands above the shoulders and the torso roughly vertical.
  const hanging = wristsY < shouldersY && incline >= PULLUP_THRESHOLDS.minBodyIncline;

  return { elbow, noseAboveBar, hanging };
}

/**
 * Pull-up rep: dead hang (arms straight) → chin over the bar → dead hang.
 * Camera faces the athlete (front view) so both arms and the bar are visible.
 */
export class PullupAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: PULLUP_THRESHOLDS.hangElbow,
    lowThreshold: PULLUP_THRESHOLDS.topElbow,
    startZone: 'high',
    minRepMs: PULLUP_THRESHOLDS.minRepMs,
  });
  private readonly elbowSmoother = new SignalSmoother(0.6);

  private validReps = 0;
  private repMaxNoseAboveBar = -Infinity;
  private repMinElbow = Infinity;
  private repMaxElbow = 0;
  /** Started lowering during the top phase — used to catch reps that skip the dead hang. */
  private loweredFromTop = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    if (pose === null) return this.result(false, events, [CUES.notVisible], {});

    const body = readBody(pose);
    const elbow = this.elbowSmoother.update(body.elbow, timestampMs);
    const metrics: Record<string, number> = {};
    if (elbow !== null) metrics.elbowAngle = Math.round(elbow);

    if (elbow === null) return this.result(false, events, [CUES.notVisible], metrics);
    if (!body.hanging) {
      this.machine.reset();
      this.resetRepAccumulators();
      return this.result(false, events, [CUES.getOnBar], metrics);
    }

    this.repMinElbow = Math.min(this.repMinElbow, elbow);
    this.repMaxElbow = Math.max(this.repMaxElbow, elbow);
    if (body.noseAboveBar !== null) {
      this.repMaxNoseAboveBar = Math.max(this.repMaxNoseAboveBar, body.noseAboveBar);
    }

    const before = this.machine.currentPhase;
    const transition = this.machine.update(elbow, timestampMs);

    if (before === 'far' && transition.type === 'none') {
      if (elbow > PULLUP_THRESHOLDS.returnElbow) this.loweredFromTop = true;
      if (this.loweredFromTop && elbow <= PULLUP_THRESHOLDS.topElbow) {
        // Went back up without reaching a full hang first.
        events.push({ type: 'repRejected', reason: CUES.fullHang, timestampMs });
        this.loweredFromTop = false;
      }
    }

    if (transition.type === 'completed') {
      events.push(this.evaluateRep(transition.durationMs, transition.tooFast, timestampMs));
      this.resetRepAccumulators();
    } else if (before === 'unknown' && this.machine.currentPhase === 'start') {
      this.resetRepAccumulators();
    }

    return this.result(true, events, [], metrics);
  }

  reset(): void {
    this.machine.reset();
    this.elbowSmoother.reset();
    this.validReps = 0;
    this.resetRepAccumulators();
  }

  private evaluateRep(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    if (this.repMaxNoseAboveBar <= 0) {
      return { type: 'repRejected', reason: CUES.chinOverBar, timestampMs };
    }

    const height = linearScore(this.repMaxNoseAboveBar, 0, 40);
    const top = linearScore(this.repMinElbow, PULLUP_THRESHOLDS.topElbow, 50);
    const hang = linearScore(this.repMaxElbow, PULLUP_THRESHOLDS.hangElbow, 168);
    const quality = 0.4 * (0.5 + 0.5 * height) + 0.3 * (0.5 + 0.5 * top) + 0.3 * (0.5 + 0.5 * hang);

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
    this.repMaxNoseAboveBar = -Infinity;
    this.repMinElbow = Infinity;
    this.repMaxElbow = 0;
    this.loweredFromTop = false;
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
      phase: phase === 'far' ? 'up' : phase === 'start' ? 'down' : 'unknown',
      events,
      cues,
      metrics,
    };
  }
}
