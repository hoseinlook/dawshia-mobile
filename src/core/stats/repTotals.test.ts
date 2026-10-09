import type { MatchResult } from '../match/types';
import { localDateString, summarizeReps } from './repTotals';

function result(exerciseId: string, reps: number, finishedAt: Date, isLocal = true): MatchResult {
  return {
    matchId: `${exerciseId}-${finishedAt.getTime()}`,
    mode: 'practice',
    exerciseId,
    timeControlId: 'bullet',
    durationMs: 60_000,
    finishedAtMs: finishedAt.getTime(),
    finishReason: 'time',
    standings: [
      {
        participant: { id: 'me', displayName: 'me', isLocal },
        score: { reps, rejectedReps: 0, qualitySum: reps },
        averageQuality: 1,
        rank: 1,
      },
    ],
  };
}

describe('summarizeReps', () => {
  const now = new Date(2026, 9, 8, 18, 0); // 8 Oct 2026, local time

  it('splits reps into today, this month and total per exercise', () => {
    const totals = summarizeReps(
      [
        result('pushup', 30, new Date(2026, 9, 8, 9, 0)),
        result('pushup', 12, new Date(2026, 9, 8, 17, 30)),
        result('pushup', 20, new Date(2026, 9, 1, 12, 0)),
        result('pushup', 50, new Date(2026, 8, 30, 12, 0)),
        result('pullup', 8, new Date(2026, 9, 7, 12, 0)),
      ],
      ['pushup', 'pullup', 'muscleup'],
      now,
    );
    expect(totals).toEqual([
      { exerciseId: 'pushup', today: 42, month: 62, total: 112 },
      { exerciseId: 'pullup', today: 0, month: 8, total: 8 },
      { exerciseId: 'muscleup', today: 0, month: 0, total: 0 },
    ]);
  });

  it('ignores unknown exercises and other participants', () => {
    const totals = summarizeReps(
      [result('handstand', 5, now), result('pushup', 9, now, false)],
      ['pushup'],
      now,
    );
    expect(totals).toEqual([{ exerciseId: 'pushup', today: 0, month: 0, total: 0 }]);
  });

  it('formats local dates', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
