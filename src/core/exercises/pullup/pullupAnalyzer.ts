import { jointAngle } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { KeypointName, Pose } from '../../pose/types';
import { RepStateMachine } from '../repStateMachine';
import { linearScore } from '../scoring';
import type { ExerciseAnalyzer, ExerciseEvent, ExerciseUpdate, FormCue } from '../types';

/**
 * Tunable thresholds for pull-up detection. Front view.
 *
 * The rep signal is how far the shoulders rose above the dead-hang position,
 * in shoulder widths. It only needs the shoulders, so it keeps working when the
 * phone stands on the floor and the hands or the bar are out of the frame.
 */
export const PULLUP_THRESHOLDS = {
  /** Shoulder rise (shoulder widths) that counts as the top of a rep. */
  topRise: 0.9,
  /** Shoulder rise at or below which the athlete is back in the hang. */
  hangRise: 0.25,
  /** A rep that rose this far but never reached the top is rejected as too short. */
  partialRise: 0.45,
  /** Below this rise during the top phase the athlete is "coming back down". */
  returnRise: 0.5,
  /**
   * Elbow angle that counts as a full dead hang, when the arms are visible. Measured hangs on
   * real videos are 140–175° (arms overhead are foreshortened); half reps stay around 120°.
   */
  hangElbow: 140,
  /** Arms this straight while hanging = a dead hang for sure: it resets the hang position. */
  straightElbow: 160,
  /** Shoulder→hip line must be at least this steep (90 = vertical), when the hips are visible. */
  minBodyIncline: 55,
  minRepMs: 600,
  /** Off the bar only after the hands are seen down this long. */
  offBarMs: 500,
  /** Lost from view this long (e.g. head above the frame at the top) = off the bar. */
  lostMs: 2000,
} as const;

const MIN_SCORE = 0.3;
/** The dead-hang baseline slowly forgets (shoulder widths per second), so it recovers if the phone moves. */
const BASELINE_DECAY_PER_S = 0.05;
/** Chin may be this much (shoulder widths) under the hand line: the camera looks up from the floor. */
const CHIN_TOLERANCE = 0.1;

const CUES = {
  notVisible: { code: 'notVisibleFront', severity: 'warning' },
  getOnBar: { code: 'getOnBar', severity: 'info' },
  chinOverBar: { code: 'chinOverBar', severity: 'warning' },
  fullHang: { code: 'fullHang', severity: 'warning' },
  tooFast: { code: 'tooFast', severity: 'warning' },
} satisfies Record<string, FormCue>;

interface Point {
  x: number;
  y: number;
}

interface BodyReading {
  shoulderY: number;
  shoulderWidth: number;
  /** Average elbow angle of the arms that are fully visible. */
  elbow: number | null;
  /** Nose height above the hands (bar), in shoulder widths, when both are visible. */
  noseAboveBar: number | null;
  /** Hands or elbows above the shoulders: reaching up to the bar. */
  armsUp: boolean;
  /** A hand clearly below the shoulders: standing, not hanging. */
  handsDown: boolean;
  /** Torso far from vertical (lying down). Unknown hips count as upright. */
  lying: boolean;
}

function readBody(pose: Pose): BodyReading | null {
  const px = (name: KeypointName): Point | null => {
    const k = pose.keypoints[name];
    return k.score >= MIN_SCORE ? { x: k.x * pose.frameWidth, y: k.y * pose.frameHeight } : null;
  };
  const ls = px('leftShoulder');
  const rs = px('rightShoulder');
  if (!ls || !rs) return null;
  const shoulderY = (ls.y + rs.y) / 2;
  const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (shoulderWidth < 1) return null;

  const angles = [
    jointAngle(pose, 'leftShoulder', 'leftElbow', 'leftWrist'),
    jointAngle(pose, 'rightShoulder', 'rightElbow', 'rightWrist'),
  ].filter((a): a is number => a !== null);
  const elbow = angles.length ? angles.reduce((a, b) => a + b, 0) / angles.length : null;

  const wrists = [px('leftWrist'), px('rightWrist')].filter((p) => p !== null);
  const elbows = [px('leftElbow'), px('rightElbow')].filter((p) => p !== null);
  const nose = px('nose');
  const wristY = wrists.length ? wrists.reduce((sum, w) => sum + w.y, 0) / wrists.length : null;
  const noseAboveBar = nose && wristY !== null ? (wristY - nose.y) / shoulderWidth : null;

  const armsUp = wrists.some((w) => w.y < shoulderY) || elbows.some((e) => e.y < shoulderY - 0.2 * shoulderWidth);
  const handsDown = wrists.some((w) => w.y > shoulderY + 0.5 * shoulderWidth);

  let lying = false;
  for (const [s, h] of [
    [ls, px('leftHip')],
    [rs, px('rightHip')],
  ] as const) {
    if (!h) continue;
    const incline = (Math.atan2(Math.abs(h.y - s.y), Math.abs(h.x - s.x)) * 180) / Math.PI;
    if (incline < PULLUP_THRESHOLDS.minBodyIncline) lying = true;
  }

  return { shoulderY, shoulderWidth, elbow, noseAboveBar, armsUp, handsDown, lying };
}

/**
 * Pull-up rep: dead hang → chin over the bar → dead hang, camera facing the
 * athlete (front view).
 *
 * Counting follows the shoulders: their rise above the dead-hang position
 * (learned while hanging), in shoulder widths, so it doesn't depend on the
 * distance to the phone. The elbow angle (full hang) and the chin-over-bar
 * check are applied whenever the arms and hands are in the frame.
 */
export class PullupAnalyzer implements ExerciseAnalyzer {
  private readonly machine = new RepStateMachine({
    highThreshold: PULLUP_THRESHOLDS.topRise,
    lowThreshold: PULLUP_THRESHOLDS.hangRise,
    startZone: 'low',
    minRepMs: PULLUP_THRESHOLDS.minRepMs,
  });
  private readonly riseSmoother = new SignalSmoother(0.6);
  private readonly widthSmoother = new SignalSmoother(0.2);
  private readonly elbowSmoother = new SignalSmoother(0.6);

  private onBar = false;
  /** Lowest shoulder position (px, y grows downwards) while hanging. */
  private baselineY: number | null = null;
  private lastMs: number | null = null;
  private handsDownSinceMs: number | null = null;
  private lastSeenMs: number | null = null;
  private lyingSinceMs: number | null = null;
  /** Smoothed shoulder width of the last frame on the bar. */
  private lastWidth: number | null = null;

  private validReps = 0;
  private repMaxRise = 0;
  private repMaxNoseAboveBar: number | null = null;
  private repMaxElbow: number | null = null;
  /** Came down from the top without reaching the hang: catches reps that skip the dead hang. */
  private loweredFromTop = false;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const events: ExerciseEvent[] = [];
    const metrics: Record<string, number> = {};
    const dt = this.lastMs === null ? 0 : Math.max(0, timestampMs - this.lastMs) / 1000;
    this.lastMs = timestampMs;

    const body = pose ? readBody(pose) : null;
    if (!body) {
      // Briefly lost (e.g. the head leaves the frame at the top): stay on the bar.
      if (this.onBar && this.lastSeenMs !== null && timestampMs - this.lastSeenMs < PULLUP_THRESHOLDS.lostMs) {
        return this.result(true, events, [], metrics);
      }
      this.leaveBar();
      return this.result(false, events, [CUES.notVisible], metrics);
    }
    this.lastSeenMs = timestampMs;

    const elbow = this.elbowSmoother.update(body.elbow, timestampMs);
    if (elbow !== null) metrics.elbowAngle = Math.round(elbow);

    // On / off the bar, with hysteresis: grabbing needs the arms up; letting go
    // needs the hands seen down for a moment (at the top the hands may be out of the frame).
    if (body.handsDown) this.handsDownSinceMs ??= timestampMs;
    else this.handsDownSinceMs = null;
    if (body.lying) this.lyingSinceMs ??= timestampMs;
    else this.lyingSinceMs = null;
    const lasted = (since: number | null) => since !== null && timestampMs - since >= PULLUP_THRESHOLDS.offBarMs;
    // Shoulders well above the hang can't be standing on the floor: "hands down" there is the
    // model mixing up the arms (seen on real videos from behind and against the light).
    const raised =
      this.baselineY !== null &&
      this.lastWidth !== null &&
      (this.baselineY - body.shoulderY) / this.lastWidth >= PULLUP_THRESHOLDS.returnRise;
    // Both need a moment: a single frame with misplaced hips or wrists is a glitch.
    const letGo = !raised && (lasted(this.lyingSinceMs) || lasted(this.handsDownSinceMs));
    if (this.onBar && letGo) this.leaveBar();
    else if (!this.onBar && body.armsUp && !body.lying && !body.handsDown) this.onBar = true;
    if (!this.onBar) return this.result(false, events, [CUES.getOnBar], metrics);

    const width = this.widthSmoother.update(body.shoulderWidth, timestampMs) ?? body.shoulderWidth;
    this.lastWidth = width;
    const decayed = this.baselineY === null ? body.shoulderY : this.baselineY - BASELINE_DECAY_PER_S * width * dt;
    // Straight arms seen while hanging: this is the dead hang, even if the phone moved since.
    const deadHang = body.elbow !== null && body.elbow >= PULLUP_THRESHOLDS.straightElbow && body.armsUp;
    this.baselineY = deadHang ? body.shoulderY : Math.max(body.shoulderY, decayed);
    const rise = this.riseSmoother.update((this.baselineY - body.shoulderY) / width, timestampMs) ?? 0;
    metrics.rise = Math.round(rise * 100) / 100;

    this.repMaxRise = Math.max(this.repMaxRise, rise);
    if (body.noseAboveBar !== null) {
      this.repMaxNoseAboveBar = Math.max(this.repMaxNoseAboveBar ?? -Infinity, body.noseAboveBar);
    }
    if (elbow !== null) this.repMaxElbow = Math.max(this.repMaxElbow ?? 0, elbow);

    // Bent arms don't count as the hang when the elbows can be seen.
    const bentAtBottom = elbow !== null && elbow < PULLUP_THRESHOLDS.hangElbow;
    const signal =
      rise <= PULLUP_THRESHOLDS.hangRise && bentAtBottom
        ? (PULLUP_THRESHOLDS.hangRise + PULLUP_THRESHOLDS.topRise) / 2
        : rise;

    const before = this.machine.currentPhase;
    const transition = this.machine.update(signal, timestampMs);

    if (before === 'far' && transition.type === 'none') {
      if (rise < PULLUP_THRESHOLDS.returnRise) this.loweredFromTop = true;
      if (this.loweredFromTop && rise >= PULLUP_THRESHOLDS.topRise) {
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
    } else if (this.machine.currentPhase === 'start' && signal <= PULLUP_THRESHOLDS.hangRise) {
      // Back in the hang without reaching the top: a half rep.
      if (this.repMaxRise >= PULLUP_THRESHOLDS.partialRise) {
        events.push({ type: 'repRejected', reason: CUES.chinOverBar, timestampMs });
      }
      // The next rep starts from here; keep the hang's straightest elbow angle for its score.
      const hangElbow = this.repMaxElbow;
      this.resetRepAccumulators();
      this.repMaxRise = rise;
      this.repMaxElbow = hangElbow;
    }

    return this.result(true, events, [], metrics);
  }

  reset(): void {
    this.machine.reset();
    this.riseSmoother.reset();
    this.widthSmoother.reset();
    this.elbowSmoother.reset();
    this.onBar = false;
    this.baselineY = null;
    this.lastMs = null;
    this.handsDownSinceMs = null;
    this.lyingSinceMs = null;
    this.lastSeenMs = null;
    this.lastWidth = null;
    this.validReps = 0;
    this.resetRepAccumulators();
  }

  private leaveBar(): void {
    this.onBar = false;
    this.baselineY = null;
    this.riseSmoother.reset();
    this.machine.reset();
    this.resetRepAccumulators();
  }

  private evaluateRep(durationMs: number, tooFast: boolean, timestampMs: number): ExerciseEvent {
    if (tooFast) return { type: 'repRejected', reason: CUES.tooFast, timestampMs };
    if (this.repMaxNoseAboveBar !== null && this.repMaxNoseAboveBar < -CHIN_TOLERANCE) {
      return { type: 'repRejected', reason: CUES.chinOverBar, timestampMs };
    }

    const height = linearScore(this.repMaxRise, PULLUP_THRESHOLDS.topRise, 1.4);
    const hang = this.repMaxElbow === null ? 1 : linearScore(this.repMaxElbow, PULLUP_THRESHOLDS.hangElbow, 168);
    const quality = 0.6 * (0.5 + 0.5 * height) + 0.4 * (0.5 + 0.5 * hang);

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
    this.repMaxRise = 0;
    this.repMaxNoseAboveBar = null;
    this.repMaxElbow = null;
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
