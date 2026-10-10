import { SignalSmoother } from '../../pose/smoothing';
import type { KeypointName, Pose } from '../../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from '../types';

const MIN_SCORE = 0.3;

/**
 * Shoulder height above the hands, as a fraction of the calibrated top
 * position: at or above TOP_RATIO the bird is at the top, at or below
 * BOTTOM_RATIO it is at the bottom.
 */
export const FLAPPY_TOP_RATIO = 0.85;
export const FLAPPY_BOTTOM_RATIO = 0.35;
/** The calibrated top (arms straight) is kept within these multiples of the shoulder width. */
const MIN_ARM_RATIO = 0.7;
const MAX_ARM_RATIO = 2.5;
/** The calibration slowly forgets old maxima (fraction of the top per second), so a moved phone recovers. */
const CALIBRATION_DECAY_PER_S = 0.01;
/** Standing / kneeling upright: hips this many shoulder widths below the shoulders. */
const UPRIGHT_HIP_DROP = 1.3;

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
  private lastMs: number | null = null;

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const metrics: Record<string, number> = {};
    const off = (cue: FormCue): ExerciseUpdate => ({ inPosition: false, phase: 'off', events: [], cues: [cue], metrics });
    if (!pose) return off(CUES.notVisible);

    const px = (name: KeypointName) => {
      const k = pose.keypoints[name];
      return k.score >= MIN_SCORE ? { x: k.x * pose.frameWidth, y: k.y * pose.frameHeight } : null;
    };
    const ls = px('leftShoulder');
    const rs = px('rightShoulder');
    const lw = px('leftWrist');
    const rw = px('rightWrist');
    if (!ls || !rs || (!lw && !rw)) return off(CUES.notVisible);

    const shoulderY = (ls.y + rs.y) / 2;
    const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (shoulderWidth < 1) return off(CUES.notVisible);
    const wrists = [lw, rw].filter((w) => w !== null);
    const wristY = wrists.reduce((sum, w) => sum + w.y, 0) / wrists.length;

    // Standing or kneeling upright: hips far below the shoulders. In a plank seen
    // from the front the hips are behind the shoulders (hidden or close to them).
    const hips = [px('leftHip'), px('rightHip')].filter((h) => h !== null);
    const hipDrop = hips.length ? hips.reduce((sum, h) => sum + h.y, 0) / hips.length - shoulderY : 0;
    const upright = hipDrop > UPRIGHT_HIP_DROP * shoulderWidth;
    // Hands must be on the floor below the shoulders.
    const handsDown = wristY > shoulderY;
    const inPlank = !upright && handsDown;

    const gap = this.gapSmoother.update(Math.max(0, wristY - shoulderY), timestampMs) ?? 0;
    const dt = this.lastMs === null ? 0 : Math.max(0, timestampMs - this.lastMs) / 1000;
    this.lastMs = timestampMs;
    if (inPlank) {
      const decayed = this.top === null ? gap : this.top * (1 - CALIBRATION_DECAY_PER_S * dt);
      this.top = Math.min(MAX_ARM_RATIO * shoulderWidth, Math.max(gap, decayed, MIN_ARM_RATIO * shoulderWidth));
    }
    const top = this.top ?? Math.max(gap, MIN_ARM_RATIO * shoulderWidth);
    const ratio = gap / top;

    metrics.armRatio = Math.round(ratio * 100) / 100;
    metrics.birdY = birdYFromRatio(ratio);
    return {
      inPosition: inPlank,
      phase: inPlank ? 'flying' : 'off',
      events: [],
      cues: inPlank ? [] : [CUES.getInPlank],
      metrics,
    };
  }

  reset(): void {
    // Keep the calibration from the setup phase; only the smoothing restarts.
    this.gapSmoother.reset();
    this.lastMs = null;
  }
}

/** Bird height from the shoulder height ratio: arms straight = high, chest at the floor = low. */
export function birdYFromRatio(ratio: number): number {
  const t = (FLAPPY_TOP_RATIO - ratio) / (FLAPPY_TOP_RATIO - FLAPPY_BOTTOM_RATIO); // 0 top … 1 bottom
  return 0.12 + Math.max(0, Math.min(1, t)) * 0.76;
}
