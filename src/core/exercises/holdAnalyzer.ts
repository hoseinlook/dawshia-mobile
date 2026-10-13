import type { Pose } from '../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from './types';

/** Result of checking one frame of a hold. */
export interface HoldCheck {
  /** The position is held correctly in this frame. */
  valid: boolean;
  /** What to fix when not valid. */
  cue: FormCue | null;
  /**
   * A form detail (e.g. locked arms) rather than leaving the position: it must fail for
   * SOFT_GRACE_MS before the hold breaks, since noisy keypoints can fake it for a moment.
   */
  soft?: boolean;
  metrics: Record<string, number>;
}

export const NOT_VISIBLE: FormCue = { code: 'notVisibleFront', severity: 'warning' };

/** Short drops in detection are ignored for this long before a hold counts as broken. */
export const HOLD_GRACE_MS = 600;
/**
 * A hold shorter than this (a failed kick-up, a detection glitch) doesn't end a "resistance"
 * competition: the athlete can try again. Longer holds end it when they break.
 */
export const MIN_HOLD_ATTEMPT_MS = 1000;
/** Grace for soft failures (see HoldCheck.soft). */
export const SOFT_GRACE_MS = 1500;

/**
 * Reusable analyzer for static holds (handstand, L-sit, front lever, …).
 * Each hold supplies a per-frame `check`; this class turns it into a
 * continuous hold: `inPosition` = holding, `metrics.holdMs` = current hold length.
 */
export class HoldAnalyzer implements ExerciseAnalyzer {
  private holdStartedAt: number | null = null;
  private lastValidAt = -Infinity;
  /** Last frame that was valid or only failed softly. */
  private lastNearlyValidAt = -Infinity;

  constructor(
    private readonly check: (pose: Pose, timestampMs: number) => HoldCheck,
    private readonly resetCheck: () => void = () => {},
    private readonly graceMs = HOLD_GRACE_MS,
  ) {}

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const result: HoldCheck = pose ? this.check(pose, timestampMs) : { valid: false, cue: NOT_VISIBLE, metrics: {} };
    const metrics = { ...result.metrics };

    if (result.valid) {
      this.lastValidAt = timestampMs;
      this.lastNearlyValidAt = timestampMs;
      this.holdStartedAt ??= timestampMs;
    } else if (this.holdStartedAt !== null) {
      if (result.soft) this.lastNearlyValidAt = timestampMs;
      const broken =
        timestampMs - this.lastNearlyValidAt > this.graceMs || timestampMs - this.lastValidAt > SOFT_GRACE_MS;
      if (broken) this.holdStartedAt = null;
    }

    const holding = this.holdStartedAt !== null;
    if (holding) metrics.holdMs = this.lastValidAt - this.holdStartedAt!;

    return {
      inPosition: holding,
      phase: holding ? 'hold' : 'off',
      events: [],
      cues: holding || !result.cue ? [] : [result.cue],
      metrics,
    };
  }

  reset(): void {
    this.resetCheck();
    this.holdStartedAt = null;
    this.lastValidAt = -Infinity;
    this.lastNearlyValidAt = -Infinity;
  }
}
