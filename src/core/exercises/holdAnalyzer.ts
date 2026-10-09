import type { Pose } from '../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from './types';

/** Result of checking one frame of a hold. */
export interface HoldCheck {
  /** The position is held correctly in this frame. */
  valid: boolean;
  /** What to fix when not valid. */
  cue: FormCue | null;
  metrics: Record<string, number>;
}

export const NOT_VISIBLE: FormCue = { code: 'notVisibleFront', severity: 'warning' };

/** Short drops in detection are ignored for this long before a hold counts as broken. */
export const HOLD_GRACE_MS = 600;

/**
 * Reusable analyzer for static holds (handstand, L-sit, front lever, …).
 * Each hold supplies a per-frame `check`; this class turns it into a
 * continuous hold: `inPosition` = holding, `metrics.holdMs` = current hold length.
 */
export class HoldAnalyzer implements ExerciseAnalyzer {
  private holdStartedAt: number | null = null;
  private lastValidAt = -Infinity;

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
      this.holdStartedAt ??= timestampMs;
    } else if (this.holdStartedAt !== null && timestampMs - this.lastValidAt > this.graceMs) {
      this.holdStartedAt = null; // hold broken
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
  }
}
