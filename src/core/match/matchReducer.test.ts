import { computeResult, createMatchState, matchReducer, remainingMs } from './matchReducer';
import type { MatchAction, MatchConfig, MatchState } from './types';

const config: MatchConfig = {
  id: 'm1',
  mode: 'friendly',
  exerciseId: 'pushup',
  timeControlId: 'bullet',
  durationMs: 60_000,
  countdownMs: 3_000,
  participants: [
    { id: 'a', displayName: 'A', isLocal: true },
    { id: 'b', displayName: 'B', isLocal: false },
  ],
};

function apply(actions: MatchAction[], state: MatchState = createMatchState(config)) {
  return actions.reduce(matchReducer, state);
}

describe('matchReducer', () => {
  it('runs setup → countdown → live → finished', () => {
    let s = apply([{ type: 'startCountdown', nowMs: 1000 }]);
    expect(s.status).toBe('countdown');
    s = apply([{ type: 'tick', nowMs: 3999 }], s);
    expect(s.status).toBe('countdown');
    s = apply([{ type: 'tick', nowMs: 4000 }], s);
    expect(s.status).toBe('live');
    expect(s.endsAtMs).toBe(64_000);
    expect(remainingMs(s, 34_000)).toBe(30_000);
    s = apply([{ type: 'tick', nowMs: 64_000 }], s);
    expect(s.status).toBe('finished');
    expect(s.finishReason).toBe('time');
  });

  it('only scores reps while live', () => {
    const s = apply([
      { type: 'rep', participantId: 'a', quality: 1, nowMs: 0 }, // setup: ignored
      { type: 'startCountdown', nowMs: 0 },
      { type: 'rep', participantId: 'a', quality: 1, nowMs: 1000 }, // countdown: ignored
      { type: 'tick', nowMs: 3000 },
      { type: 'rep', participantId: 'a', quality: 0.9, nowMs: 4000 },
      { type: 'rep', participantId: 'b', quality: 0.8, nowMs: 4100 },
      { type: 'repRejected', participantId: 'b', nowMs: 4200 },
      { type: 'rep', participantId: 'a', quality: 1, nowMs: 70_000 }, // after time: ignored
    ]);
    expect(s.scores.a).toEqual({ reps: 1, rejectedReps: 0, qualitySum: 0.9 });
    expect(s.scores.b).toEqual({ reps: 1, rejectedReps: 1, qualitySum: 0.8 });
  });

  it('ranks by reps, then by average quality', () => {
    const s = apply([
      { type: 'startCountdown', nowMs: 0 },
      { type: 'tick', nowMs: 3000 },
      { type: 'rep', participantId: 'a', quality: 0.7, nowMs: 4000 },
      { type: 'rep', participantId: 'b', quality: 0.9, nowMs: 4000 },
      { type: 'tick', nowMs: 63_000 },
    ]);
    const result = computeResult(s);
    expect(result.standings.map((r) => [r.participant.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('can be aborted', () => {
    const s = apply([{ type: 'startCountdown', nowMs: 0 }, { type: 'abort', nowMs: 500 }]);
    expect(s.status).toBe('finished');
    expect(computeResult(s).finishReason).toBe('aborted');
  });
});
