import { inclinationFromHorizontal, jointAngle } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/**
 * Tunable thresholds for muscle-up detection. Front view, portrait.
 *
 * The main signal is the height of the shoulders relative to the hands (the
 * bar), measured in arm lengths: about -1 in a dead hang, about +1 in the
 * support position above the bar.
 */
export const MUSCLEUP_THRESHOLDS = {
  /** Shoulders at least this far below the bar (arm lengths) = hanging. */
  hangHeight: -0.6,
  /** Shoulders at least this far above the bar (arm lengths) = over the bar. */
  supportHeight: 0.5,
  /** Elbow angle that counts as straight arms (dead hang and lockout). */
  straightElbow: 150,
  /** Hands may drift this far (arm lengths) from the bar before we consider them off it. */
  maxBarDrift: 0.4,
  /** Shoulder→hip line must be at least this steep (90 = vertical). */
  minBodyIncline: 55,
  minRepMs: 1200,
} as const;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  getOnBar: { code: 'getOnBar', severity: 'info' },
  lockOut: { code: 'lockOut', severity: 'warning' },
  fullHang: { code: 'fullHang', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
} satisfies Record<string, FormCue>;

interface BodyReading {
  /** Shoulder height above the hands in arm lengths (+ = above the bar). */
  height: number;
  /** Average elbow angle of the visible arms. */
  elbow: number;
  /** Hand height in pixels (the bar while hanging). */
  wristsY: number;
  armLength: number;
  upright: boolean;
}

function distance(pose: Pose, a: keyof Pose['keypoints'], b: keyof Pose['keypoints']): number {
  const ka = pose.keypoints[a];
  const kb = pose.keypoints[b];
  return Math.hypot((ka.x - kb.x) * pose.frameWidth, (ka.y - kb.y) * pose.frameHeight);
}

function readBody(pose: Pose): BodyReading | null {
  const left = jointAngle(pose, 'leftShoulder', 'leftElbow', 'leftWrist');
  const right = jointAngle(pose, 'rightShoulder', 'rightElbow', 'rightWrist');
  if (left === null || right === null) return null;

  const k = pose.keypoints;
  const armLength =
    (distance(pose, 'leftShoulder', 'leftElbow') +
      distance(pose, 'leftElbow', 'leftWrist') +
      distance(pose, 'rightShoulder', 'rightElbow') +
      distance(pose, 'rightElbow', 'rightWrist')) /
    2;
  if (armLength === 0) return null;

  const wristsY = ((k.leftWrist.y + k.rightWrist.y) / 2) * pose.frameHeight;
  const shouldersY = ((k.leftShoulder.y + k.rightShoulder.y) / 2) * pose.frameHeight;
  const incline = Math.max(
    inclinationFromHorizontal(pose, 'leftShoulder', 'leftHip') ?? 0,
    inclinationFromHorizontal(pose, 'rightShoulder', 'rightHip') ?? 0,
  );

  return {
    height: (wristsY - shouldersY) / armLength, // y grows downward
    elbow: (left + right) / 2,
    wristsY,
    armLength,
    upright: incline >= MUSCLEUP_THRESHOLDS.minBodyIncline,
  };
}

/**
 * Muscle-up rep: dead hang → pull over the bar → lock out in support → back to a dead hang.
 * Camera faces the athlete (front view) with room above the bar.
 */
export class MuscleupAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: MUSCLEUP_THRESHOLDS.supportHeight,
    lowThreshold: MUSCLEUP_THRESHOLDS.hangHeight,
    startZone: 'low',
    minRepMs: MUSCLEUP_THRESHOLDS.minRepMs,
  });
  private readonly heightSmoother = new SignalSmoother(0.6);
  private readonly elbowSmoother = new SignalSmoother(0.6);

  private validReps = 0;
  /** Hand height while hanging = where the bar is. */
  private barY: number | null = null;
  private repMaxSupportElbow = 0;
  private repMaxHeight = -Infinity;
  /** Dropped back under the bar during the top phase — used to catch reps that skip the dead hang. */
  private droppedUnderBar = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    if (pose === null) return this.result(false, events, [CUES.notVisible], {});

    const body = readBody(pose);
    if (body === null) return this.result(false, events, [CUES.notVisible], {});

    const height = this.heightSmoother.update(body.height, timestampMs)!;
    const elbow = this.elbowSmoother.update(body.elbow, timestampMs)!;
    const metrics = { elbowAngle: Math.round(elbow), barHeight: Math.round(height * 100) / 100 };

    const hanging = height <= MUSCLEUP_THRESHOLDS.hangHeight && elbow >= MUSCLEUP_THRESHOLDS.straightElbow;
    if (hanging && body.upright) this.barY = body.wristsY;

    const onBar =
      body.upright &&
      this.barY !== null &&
      Math.abs(body.wristsY - this.barY) <= MUSCLEUP_THRESHOLDS.maxBarDrift * body.armLength;
    if (!onBar) {
      // Off the bar (or never got on): forget any half-done rep.
      this.machine.reset();
      this.barY = null;
      this.resetRepAccumulators();
      return this.result(false, events, [CUES.getOnBar], metrics);
    }

    // Only a straight-arm hang counts as the bottom of a rep.
    const signal = height < 0 && !hanging ? Math.max(height, MUSCLEUP_THRESHOLDS.hangHeight + 0.01) : height;

    if (height > 0) this.repMaxSupportElbow = Math.max(this.repMaxSupportElbow, elbow);
    this.repMaxHeight = Math.max(this.repMaxHeight, height);

    const before = this.machine.currentPhase;
    const transition = this.machine.update(signal, timestampMs);

    if (before === 'far' && transition.type === 'none') {
      if (height < 0) this.droppedUnderBar = true;
      if (this.droppedUnderBar && height >= MUSCLEUP_THRESHOLDS.supportHeight) {
        // Went back over the bar without a full hang first.
        events.push({ type: 'repRejected', reason: CUES.fullHang, timestampMs });
        this.droppedUnderBar = false;
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
    this.heightSmoother.reset();
    this.elbowSmoother.reset();
    this.validReps = 0;
    this.barY = null;
    this.resetRepAccumulators();
  }

  private evaluateRep(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    if (this.repMaxSupportElbow < MUSCLEUP_THRESHOLDS.straightElbow) {
      return { type: 'repRejected', reason: CUES.lockOut, timestampMs };
    }

    const lockout = linearScore(this.repMaxSupportElbow, MUSCLEUP_THRESHOLDS.straightElbow, 170);
    const height = linearScore(this.repMaxHeight, MUSCLEUP_THRESHOLDS.supportHeight, 0.9);
    const quality = 0.5 * (0.5 + 0.5 * lockout) + 0.5 * (0.5 + 0.5 * height);

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
    this.repMaxSupportElbow = 0;
    this.repMaxHeight = -Infinity;
    this.droppedUnderBar = false;
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
