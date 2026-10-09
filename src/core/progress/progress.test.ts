import type { MatchResult } from '../match/types';
import { computeGains, computeProgress, computeStreak, personalBest } from './progress';
import { levelInfo, rankForLevel, sessionXp, xpForLevel } from './xp';

let n = 0;
function session(
  exerciseId: string,
  reps: number,
  at: Date,
  opts: { quality?: number; timeControlId?: 'bullet' | 'endurance'; aborted?: boolean } = {},
): MatchResult {
  const quality = opts.quality ?? 0.8;
  return {
    matchId: `m${n++}`,
    mode: 'practice',
    exerciseId,
    timeControlId: opts.timeControlId ?? 'bullet',
    durationMs: 60_000,
    finishedAtMs: at.getTime(),
    finishReason: opts.aborted ? 'aborted' : 'time',
    standings: [
      {
        participant: { id: 'me', displayName: 'me', isLocal: true },
        score: { reps, rejectedReps: 0, qualitySum: reps * quality },
        averageQuality: quality,
        rank: 1,
      },
    ],
  };
}

const day = (d: number, h = 12) => new Date(2026, 9, d, h);

describe('xp and levels', () => {
  it('rewards reps, form quality and finishing', () => {
    expect(sessionXp(10, 10, true)).toBe(10 * 10 + 50 + 20);
    expect(sessionXp(10, 0, false)).toBe(100);
    expect(sessionXp(0, 0, false)).toBe(0);
  });

  it('maps XP to levels with growing gaps', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(levelInfo(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: 100, progress: 0 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(450)).toMatchObject({ level: 3, xpIntoLevel: 150, xpForNext: 300 });
    for (let xp = 0; xp < 50_000; xp += 137) {
      const info = levelInfo(xp);
      expect(xp).toBeGreaterThanOrEqual(xpForLevel(info.level));
      expect(xp).toBeLessThan(xpForLevel(info.level + 1));
    }
  });

  it('names ranks by level', () => {
    expect(rankForLevel(1)).toBe('rookie');
    expect(rankForLevel(3)).toBe('fighter');
    expect(rankForLevel(12)).toBe('champion');
    expect(rankForLevel(40)).toBe('legend');
  });
});

describe('streak', () => {
  it('counts consecutive days, still alive if last trained yesterday', () => {
    const dates = new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-01']);
    expect(computeStreak(dates, '2026-10-08')).toEqual({ current: 3, best: 3, trainedToday: false });
    expect(computeStreak(new Set([...dates, '2026-10-08']), '2026-10-08')).toEqual({
      current: 4,
      best: 4,
      trainedToday: true,
    });
    expect(computeStreak(dates, '2026-10-10').current).toBe(0);
  });
});

describe('progress', () => {
  it('sums reps, daily goal and unlocks achievements', () => {
    const history = [
      session('pushup', 30, day(6)),
      session('pushup', 25, day(7)),
      session('pullup', 12, day(8, 9), { quality: 0.95 }),
      session('pushup', 20, day(8, 10)),
    ];
    const p = computeProgress(history, day(8, 20));
    expect(p.totalReps).toBe(87);
    expect(p.todayReps).toBe(32);
    expect(p.streak).toEqual({ current: 3, best: 3, trainedToday: true });
    expect([...p.achievements].sort()).toEqual(
      ['firstRep', 'firstSession', 'perfectForm', 'pullups10', 'streak3'].sort(),
    );
  });

  it('personal best ignores abandoned sessions and other competitions', () => {
    const history = [
      session('pushup', 30, day(6)),
      session('pushup', 45, day(7), { aborted: true }),
      session('pushup', 60, day(7), { timeControlId: 'endurance' }),
    ];
    expect(personalBest(history, 'pushup', 'bullet')).toBe(30);
  });
});

describe('computeGains', () => {
  it('reports XP, level up, records, achievements and goal for the new session', () => {
    const history = [session('pushup', 20, day(8, 9))];
    const result = session('pushup', 35, day(8, 18), { quality: 1 });
    const gains = computeGains([...history, result], result, day(8, 19));
    expect(gains.xp).toBe(35 * 10 + 35 * 5 + 20);
    expect(gains.leveledUp).toBe(true);
    expect(gains.previousBest).toBe(20);
    expect(gains.isPersonalBest).toBe(true);
    expect(gains.goalReached).toBe(true); // 20 → 55 of 50
    expect(gains.newAchievements).toEqual(['perfectForm']);
  });
});

describe('hold (handstand) progress', () => {
  function holdSession(holdMs: number, at: Date, aborted = false): MatchResult {
    const s = session('handstand', 0, at, { aborted });
    return { ...s, timeControlId: 'resistance', standings: [{ ...s.standings[0], score: { reps: 0, rejectedReps: 0, qualitySum: 0, holdMs } }] };
  }

  it('earns XP per second, records seconds and unlocks the 30s achievement', () => {
    const history = [holdSession(12_500, day(7)), holdSession(31_200, day(8))];
    const p = computeProgress(history, day(8, 20));
    expect(p.totalXp).toBe(12 * 2 + 20 + 31 * 2 + 20);
    expect(p.achievements.has('handstand30')).toBe(true);
    expect(p.todayReps).toBe(0); // holds don't count toward the rep goal
    expect(personalBest(history, 'handstand', 'resistance')).toBe(31);
  });

  it('flags a new longest hold as a personal best', () => {
    const first = holdSession(20_000, day(7));
    const second = holdSession(25_000, day(8));
    const gains = computeGains([first, second], second, day(8, 20));
    expect(gains.previousBest).toBe(20);
    expect(gains.isPersonalBest).toBe(true);
  });
});

describe('game and ranked progress', () => {
  it('earns XP per pipe and unlocks Frequent Flyer', () => {
    const s = session('flappy', 0, day(8));
    const game: MatchResult = {
      ...s,
      timeControlId: 'flight',
      standings: [{ ...s.standings[0], score: { reps: 0, rejectedReps: 0, qualitySum: 0, points: 12, done: true } }],
    };
    const p = computeProgress([game], day(8, 20));
    expect(p.totalXp).toBe(12 * 5 + 20);
    expect(p.achievements.has('flappy10')).toBe(true);
    expect(personalBest([game], 'flappy', 'flight')).toBe(12);
  });

  it('unlocks First Victory only for a ranked win', () => {
    const base = session('pushup', 30, day(8));
    const opponent = {
      participant: { id: 'op', displayName: 'op', isLocal: false },
      score: { reps: 20, rejectedReps: 0, qualitySum: 16 },
      averageQuality: 0.8,
      rank: 2,
    };
    const win: MatchResult = { ...base, mode: 'ranked', standings: [base.standings[0], opponent] };
    const loss: MatchResult = {
      ...base,
      mode: 'ranked',
      standings: [{ ...base.standings[0], rank: 2 }, { ...opponent, rank: 1 }],
    };
    expect(computeProgress([loss], day(8, 20)).achievements.has('firstWin')).toBe(false);
    expect(computeProgress([win], day(8, 20)).achievements.has('firstWin')).toBe(true);
  });
});
