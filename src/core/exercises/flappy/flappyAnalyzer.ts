import { SignalSmoother } from '../../pose/smoothing';
import type { KeypointName, Pose } from '../../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from '../types';

const MIN_SCORE = 0.3;

/**
 * Shoulder height above the hands, as a fraction of the calibrated top
 * position: at or above TOP_RATIO the bird is at the top; at or below the
 * learned bottom (+ BOTTOM_MARGIN) it is at the bottom.
 */
export const FLAPPY_TOP_RATIO = 0.85;
/**
 * How low a full push-up looks depends on the camera height and the hand
 * placement (0.25–0.65 of the top in real videos), so the bottom is learned:
 * it starts at BOTTOM_START, follows the deepest push-up seen (down to
 * BOTTOM_MIN) and slowly drifts back up (to BOTTOM_MAX) when the push-ups are
 * shallower than that, so everyone can reach the whole field.
 */
export const FLAPPY_BOTTOM_START = 0.5;
const BOTTOM_MIN = 0.2;
const BOTTOM_MAX = 0.6;
const BOTTOM_DRIFT_PER_S = 0.02;
/** The bird reaches the bottom this much (ratio) before the deepest point, so it isn't only touched for a frame. */
const BOTTOM_MARGIN = 0.05;
/** The calibrated top (arms straight) is kept within these multiples of the shoulder width. */
const MIN_ARM_RATIO = 0.7;
const MAX_ARM_RATIO = 2.5;
/** The calibration slowly forgets old maxima (fraction of the top per second), so a moved phone recovers. */
const CALIBRATION_DECAY_PER_S = 0.01;
/** Standing / kneeling upright: hips this many shoulder widths below the shoulders. */
const UPRIGHT_HIP_DROP = 1.3;
/**
 * Leaving the plank only counts after this long: a single missed frame (a hand
 * not detected, motion blur at the bottom of a push-up) must not end the game.
 */
export const FLAPPY_PLANK_GRACE_MS = 1000;
/** Shoulders may drop this far (shoulder widths) below the hands' level and still count as the plank. */
const HANDS_LEVEL_TOLERANCE = 0.3;
/** Remembered hand position (the hands stay on the floor) is used this long when the wrists aren't detected. */
const HANDS_MEMORY_MS = 5000;

const CUES = {
  notVisible: { code: 'notVisible', severity: 'warning' },
  getInPlank: { code: 'getInPlank', severity: 'info' },
} satisfies Record<string, FormCue>;

/**
 * Flappy Push controller, face to face: the phone stands on the floor in front
 * of the athlete's head and sees them from the front. In a push-up plank the
 * height of the shoulders above the hands sets the bird height
 * (`metrics.birdY`, 0 = top … 1 = bottom). `inPosition` = in the plank;
 * leaving it ends the game. The game logic itself lives in core/games/flappy.
 *
 * From the front the elbow angle is unreliable (the arms point at the camera),
 * so the analyzer uses the vertical shoulder-to-wrist distance instead,
 * calibrated against the highest position seen (arms straight) and the
 * shoulder width, which makes it independent of the distance to the phone.
 */
export class FlappyAnalyzer implements ExerciseAnalyzer {
  private readonly gapSmoother = new SignalSmoother(0.5);
  /** Shoulder-above-wrist distance with straight arms (px), learned while playing. */
  private top: number | null = null;
  /** Learned bottom of a push-up, as a ratio of `top`. */
  private bottom = FLAPPY_BOTTOM_START;
  private lastMs: number | null = null;
  /** Hands' height on the floor (px), last time they were seen in the plank. */
  private hands: { y: number; atMs: number } | null = null;
  /** Last time the plank was seen, and the bird height then. */
  private lastPlankMs: number | null = null;
  private lastBirdY: number | null = null;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const metrics: Record<string, number> = {};
    const off = (cue: FormCue): ExerciseUpdate => {
      // Within the grace period the bird keeps its height and the plank still counts.
      if (this.lastPlankMs !== null && timestampMs - this.lastPlankMs < FLAPPY_PLANK_GRACE_MS) {
        if (this.lastBirdY !== null) metrics.birdY = this.lastBirdY;
        return { inPosition: true, phase: 'flying', events: [], cues: [], metrics };
      }
      return { inPosition: false, phase: 'off', events: [], cues: [cue], metrics };
    };
    if (!pose) return off(CUES.notVisible);

    const px = (name: KeypointName) => {
      const k = pose.keypoints[name];
      return k.score >= MIN_SCORE ? { x: k.x * pose.frameWidth, y: k.y * pose.frameHeight } : null;
    };
    const ls = px('leftShoulder');
    const rs = px('rightShoulder');
    const lw = px('leftWrist');
    const rw = px('rightWrist');
    if (!ls || !rs) return off(CUES.notVisible);

    const shoulderY = (ls.y + rs.y) / 2;
    const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (shoulderWidth < 1) return off(CUES.notVisible);
    // The hands don't move during the game: when they aren't detected, use where they were.
    const wrists = [lw, rw].filter((w) => w !== null);
    const recentHands = this.hands !== null && timestampMs - this.hands.atMs < HANDS_MEMORY_MS ? this.hands.y : null;
    const wristY = wrists.length ? wrists.reduce((sum, w) => sum + w.y, 0) / wrists.length : recentHands;
    if (wristY === null) return off(CUES.notVisible);

    // Standing or kneeling upright: hips far below the shoulders. In a plank seen
    // from the front the hips are behind the shoulders (hidden or close to them).
    const hips = [px('leftHip'), px('rightHip')].filter((h) => h !== null);
    const hipDrop = hips.length ? hips.reduce((sum, h) => sum + h.y, 0) / hips.length - shoulderY : 0;
    const upright = hipDrop > UPRIGHT_HIP_DROP * shoulderWidth;
    // Hands on the floor below the shoulders; at the bottom of a push-up the
    // shoulders come down to about the height of the hands.
    const handsDown = wristY > shoulderY - HANDS_LEVEL_TOLERANCE * shoulderWidth;
    const inPlank = !upright && handsDown;

    const gap = this.gapSmoother.update(Math.max(0, wristY - shoulderY), timestampMs) ?? 0;
    const dt = this.lastMs === null ? 0 : Math.max(0, timestampMs - this.lastMs) / 1000;
    this.lastMs = timestampMs;
    if (inPlank && wrists.length) this.hands = { y: wristY, atMs: timestampMs };
    if (inPlank) {
      const decayed = this.top === null ? gap : this.top * (1 - CALIBRATION_DECAY_PER_S * dt);
      this.top = Math.min(MAX_ARM_RATIO * shoulderWidth, Math.max(gap, decayed, MIN_ARM_RATIO * shoulderWidth));
    }
    const top = this.top ?? Math.max(gap, MIN_ARM_RATIO * shoulderWidth);
    const ratio = gap / top;
    if (inPlank) {
      this.bottom = Math.max(BOTTOM_MIN, Math.min(ratio, this.bottom + BOTTOM_DRIFT_PER_S * dt, BOTTOM_MAX));
    }

    metrics.armRatio = Math.round(ratio * 100) / 100;
    metrics.bottomRatio = Math.round(this.bottom * 100) / 100;
    metrics.birdY = birdYFromRatio(ratio, this.bottom);
    if (!inPlank) return off(CUES.getInPlank);
    this.lastPlankMs = timestampMs;
    this.lastBirdY = metrics.birdY;
    return { inPosition: true, phase: 'flying', events: [], cues: [], metrics };
  }

  reset(): void {
    // Keep the calibration (top and bottom), the hands and the grace period from the setup phase; only the smoothing restarts.
    this.gapSmoother.reset();
    this.lastMs = null;
  }
}

/** Bird height from the shoulder height ratio: arms straight = high, at the (learned) bottom = low. */
export function birdYFromRatio(ratio: number, bottom = FLAPPY_BOTTOM_START): number {
  const t = (FLAPPY_TOP_RATIO - ratio) / (FLAPPY_TOP_RATIO - bottom - BOTTOM_MARGIN); // 0 top … 1 bottom
  return 0.12 + Math.max(0, Math.min(1, t)) * 0.76;
}
