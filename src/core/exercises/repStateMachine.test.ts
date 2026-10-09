import { RepStateMachine } from './repStateMachine';

describe('RepStateMachine', () => {
  const config = { highThreshold: 150, lowThreshold: 100, startZone: 'high', minRepMs: 300 } as const;

  it('completes a rep on start → far → start', () => {
    const m = new RepStateMachine(config);
    expect(m.update(170, 0).type).toBe('none');
    expect(m.update(120, 200).type).toBe('none');
    expect(m.update(90, 400).type).toBe('enteredFar');
    const done = m.update(160, 800);
    expect(done).toEqual({ type: 'completed', startedAtMs: 0, durationMs: 800, tooFast: false });
  });

  it('ignores jitter between thresholds (hysteresis)', () => {
    const m = new RepStateMachine(config);
    m.update(170, 0);
    for (const [v, t] of [[120, 100], [140, 200], [110, 300], [149, 400]] as const) {
      expect(m.update(v, t).type).toBe('none');
    }
    expect(m.currentPhase).toBe('start');
  });

  it('must see the start zone before counting', () => {
    const m = new RepStateMachine(config);
    expect(m.update(90, 0).type).toBe('none');
    expect(m.update(170, 500).type).toBe('none');
    expect(m.currentPhase).toBe('start');
  });

  it('flags reps faster than minRepMs', () => {
    const m = new RepStateMachine(config);
    m.update(170, 0);
    m.update(90, 100);
    const done = m.update(170, 200);
    expect(done.type === 'completed' && done.tooFast).toBe(true);
  });

  it('supports exercises that start in the low zone (e.g. pull-ups)', () => {
    const m = new RepStateMachine({ ...config, startZone: 'low' });
    m.update(80, 0);
    expect(m.update(160, 500).type).toBe('enteredFar');
    expect(m.update(80, 1000).type).toBe('completed');
  });
});
