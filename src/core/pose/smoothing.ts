/**
 * Smoothing for noisy per-frame signals (e.g. joint angles): a median of the last 3 samples
 * drops one-frame detection glitches (a wrist jumping for a single frame), then an exponential
 * moving average evens out the jitter.
 * Gaps (`null`) are tolerated: the last value is held until `maxGapMs` passes.
 */
export class SignalSmoother {
  private value: number | null = null;
  private lastSeenMs = -Infinity;
  private recent: number[] = [];

  constructor(
    private readonly alpha = 0.5,
    private readonly maxGapMs = 500,
  ) {}

  update(sample: number | null, timestampMs: number): number | null {
    if (sample === null) {
      if (timestampMs - this.lastSeenMs > this.maxGapMs) {
        this.value = null;
        this.recent = [];
      }
      return this.value;
    }
    this.lastSeenMs = timestampMs;
    this.recent.push(sample);
    if (this.recent.length > 3) this.recent.shift();
    const filtered = this.recent.length === 3 ? median3(this.recent[0], this.recent[1], this.recent[2]) : sample;
    this.value = this.value === null ? filtered : this.alpha * filtered + (1 - this.alpha) * this.value;
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.lastSeenMs = -Infinity;
    this.recent = [];
  }
}

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}
