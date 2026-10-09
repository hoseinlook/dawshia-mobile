/**
 * Reusable two-phase rep detector driven by a single scalar signal
 * (usually a joint angle).
 *
 * A rep is: start phase → far phase → back to start phase.
 *   - push-up / squat / dip: start = 'top' (signal high), far = 'bottom'
 *   - pull-up: start = 'bottom' (arms straight), far = 'top'
 *
 * Hysteresis (separate enter thresholds) prevents jitter from double-counting.
 */

export type RepPhase = 'unknown' | 'start' | 'far';

export interface RepStateMachineConfig {
  /** Signal must be >= this to be in the "high" zone. */
  highThreshold: number;
  /** Signal must be <= this to be in the "low" zone. */
  lowThreshold: number;
  /** Which zone is the starting phase of a rep. */
  startZone: 'high' | 'low';
  /** Reps faster than this are ignored (anti-cheat / jitter guard). */
  minRepMs: number;
}

export type RepTransition =
  | { type: 'none' }
  | { type: 'enteredFar'; timestampMs: number }
  /** A full cycle completed. The caller decides whether the rep is valid. */
  | { type: 'completed'; startedAtMs: number; durationMs: number; tooFast: boolean };

export class RepStateMachine {
  private phase: RepPhase = 'unknown';
  private repStartedAtMs = 0;

  constructor(private readonly config: RepStateMachineConfig) {}

  get currentPhase(): RepPhase {
    return this.phase;
  }

  update(signal: number | null, timestampMs: number): RepTransition {
    if (signal === null) return { type: 'none' };

    const { highThreshold, lowThreshold, startZone } = this.config;
    const inHigh = signal >= highThreshold;
    const inLow = signal <= lowThreshold;
    const inStartZone = startZone === 'high' ? inHigh : inLow;
    const inFarZone = startZone === 'high' ? inLow : inHigh;

    switch (this.phase) {
      case 'unknown':
        if (inStartZone) {
          this.phase = 'start';
          this.repStartedAtMs = timestampMs;
        }
        return { type: 'none' };

      case 'start':
        if (inFarZone) {
          this.phase = 'far';
          return { type: 'enteredFar', timestampMs };
        }
        // Still resting at the start position: keep moving the rep start forward
        // so rep duration measures the movement, not the rest before it.
        if (inStartZone) this.repStartedAtMs = timestampMs;
        return { type: 'none' };

      case 'far':
        if (inStartZone) {
          const startedAtMs = this.repStartedAtMs;
          const durationMs = timestampMs - startedAtMs;
          this.phase = 'start';
          this.repStartedAtMs = timestampMs;
          return {
            type: 'completed',
            startedAtMs,
            durationMs,
            tooFast: durationMs < this.config.minRepMs,
          };
        }
        return { type: 'none' };
    }
  }

  reset(): void {
    this.phase = 'unknown';
    this.repStartedAtMs = 0;
  }
}
