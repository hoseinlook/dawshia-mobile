/**
 * Exponential moving average for noisy per-frame signals (e.g. joint angles).
 * Gaps (`null`) are tolerated: the last value is held until `maxGapMs` passes.
 */
export class SignalSmoother {
  private value: number | null = null;
  private lastSeenMs = -Infinity;

  constructor(
    private readonly alpha = 0.5,
    private readonly maxGapMs = 500,
  ) {}

  update(sample: number | null, timestampMs: number): number | null {
    if (sample === null) {
      if (timestampMs - this.lastSeenMs > this.maxGapMs) this.value = null;
      return this.value;
    }
    this.lastSeenMs = timestampMs;
    this.value = this.value === null ? sample : this.alpha * sample + (1 - this.alpha) * this.value;
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.lastSeenMs = -Infinity;
  }
}
