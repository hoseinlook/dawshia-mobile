import { handstandPose } from '../../pose/testing/syntheticPose';
import { HandstandAnalyzer } from './handstandAnalyzer';

/** Feeds poses at ~30 fps from `startMs` for `durationMs`; returns the last update. */
function feed(analyzer: HandstandAnalyzer, opts: Parameters<typeof handstandPose>[0], startMs: number, durationMs: number) {
  let last = analyzer.update(handstandPose({ ...opts, timestampMs: startMs }), startMs);
  for (let t = startMs + 33; t <= startMs + durationMs; t += 33) {
    last = analyzer.update(handstandPose({ ...opts, timestampMs: t }), t);
  }
  return last;
}

describe('HandstandAnalyzer', () => {
  it('counts a straight, locked handstand as holding and measures the hold', () => {
    const a = new HandstandAnalyzer();
    const update = feed(a, {}, 0, 5000);
    expect(update.inPosition).toBe(true);
    expect(update.metrics.holdMs).toBeGreaterThanOrEqual(4900);
  });

  it('asks to kick up while standing', () => {
    const update = feed(new HandstandAnalyzer(), { standing: true }, 0, 1000);
    expect(update.inPosition).toBe(false);
    expect(update.cues[0].code).toBe('kickUp');
  });

  it('requires locked arms and a vertical body', () => {
    expect(feed(new HandstandAnalyzer(), { elbowAngle: 110 }, 0, 1000).cues[0].code).toBe('lockArms');
    expect(feed(new HandstandAnalyzer(), { lean: 45 }, 0, 1000).cues[0].code).toBe('straightBody');
  });

  it('ignores brief detection drops but ends the hold on a real break', () => {
    const a = new HandstandAnalyzer();
    feed(a, {}, 0, 3000);
    // 300 ms of a missing pose: still holding.
    let update = a.update(null, 3300);
    expect(update.inPosition).toBe(true);
    update = feed(a, {}, 3333, 1000);
    expect(update.metrics.holdMs).toBeGreaterThanOrEqual(4300);
    // Came down for a full second: hold broken.
    update = feed(a, { standing: true }, 4400, 1000);
    expect(update.inPosition).toBe(false);
    expect(update.metrics.holdMs).toBeUndefined();
  });
});
