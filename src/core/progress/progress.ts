import type { MatchResult } from '../match/types';
import { isGame, isHold, type TimeControlId } from '../match/timeControls';
import { localDateString } from '../stats/repTotals';
import { gameXp, holdXp, levelInfo, rankForLevel, sessionXp, type LevelInfo, type RankId } from './xp';

/** Reps per day the athlete aims for (clear goal → flow). */
export const DAILY_GOAL_REPS = 50;

export type AchievementId =
  | 'firstRep'
  | 'firstSession'
  | 'reps100'
  | 'reps1000'
  | 'streak3'
  | 'streak7'
  | 'perfectForm'
  | 'allRounder'
  | 'endurance'
  | 'pullups10'
  | 'firstMuscleup'
  | 'pushups50'
  | 'handstand30'
  | 'flappy10'
  | 'firstWin';

/** Achievements in display order, with the icon each one shows. */
export const ACHIEVEMENTS: readonly { id: AchievementId; icon: string }[] = [
  { id: 'firstRep', icon: 'star-four-points' },
  { id: 'firstSession', icon: 'flag-checkered' },
  { id: 'reps100', icon: 'numeric-10-circle' },
  { id: 'reps1000', icon: 'crown' },
  { id: 'streak3', icon: 'fire' },
  { id: 'streak7', icon: 'calendar-check' },
  { id: 'perfectForm', icon: 'target' },
  { id: 'allRounder', icon: 'shield-star' },
  { id: 'endurance', icon: 'infinity' },
  { id: 'pullups10', icon: 'human-handsup' },
  { id: 'firstMuscleup', icon: 'lightning-bolt' },
  { id: 'pushups50', icon: 'arm-flex' },
  { id: 'handstand30', icon: 'human-handsdown' },
  { id: 'flappy10', icon: 'bird' },
  { id: 'firstWin', icon: 'sword-cross' },
];

export interface Streak {
  /** Consecutive training days ending today (or yesterday, if not trained yet today). */
  current: number;
  best: number;
  trainedToday: boolean;
}

export interface Progress {
  totalXp: number;
  level: LevelInfo;
  rank: RankId;
  streak: Streak;
  todayReps: number;
  dailyGoal: number;
  totalReps: number;
  sessions: number;
  achievements: ReadonlySet<AchievementId>;
}

function myScore(result: MatchResult) {
  return result.standings.find((s) => s.participant.isLocal);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function computeStreak(trainingDates: ReadonlySet<string>, today: string): Streak {
  const days = [...trainingDates].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const todayN = dayNumber(today);
  const set = new Set(days);
  const trainedToday = set.has(todayN);
  // An unbroken run may end yesterday: today is still open.
  let cursor = trainedToday ? todayN : todayN - 1;
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, best, trainedToday };
}

/**
 * The session's score in its competition's unit: valid reps, or whole seconds
 * held for hold (resistance) competitions.
 */
export function scoreValue(result: MatchResult): number {
  const me = myScore(result);
  if (!me) return 0;
  if (isHold(result.timeControlId)) return Math.floor((me.score.holdMs ?? 0) / 1000);
  if (isGame(result.timeControlId)) return me.score.points ?? 0;
  return me.score.reps;
}

/** Best score (reps, or seconds for holds) in a full (not abandoned) session of this competition. */
export function personalBest(
  results: readonly MatchResult[],
  exerciseId: string,
  timeControlId: TimeControlId,
): number {
  let best = 0;
  for (const r of results) {
    if (r.exerciseId !== exerciseId || r.timeControlId !== timeControlId || r.finishReason !== 'time') continue;
    best = Math.max(best, scoreValue(r));
  }
  return best;
}

/** Everything the gamified UI shows, derived purely from the session history. */
export function computeProgress(results: readonly MatchResult[], now: Date): Progress {
  const today = localDateString(now);
  let totalXp = 0;
  let totalReps = 0;
  let todayReps = 0;
  let sessions = 0;
  const dates = new Set<string>();
  const exercisesDone = new Set<string>();
  const perExerciseBest = new Map<string, number>();
  let perfect = false;
  let endurance = false;
  let longestHoldMs = 0;
  let bestGamePoints = 0;
  let wonRanked = false;

  for (const r of results) {
    const me = myScore(r);
    if (!me) continue;
    const { reps, qualitySum } = me.score;
    const completed = r.finishReason === 'time';
    // A ranked win: first place, alone, against at least one opponent (or the opponent left).
    if (r.mode === 'ranked' && r.standings.length > 1 && r.finishReason !== 'aborted') {
      const others = r.standings.filter((s) => !s.participant.isLocal);
      if (me.rank === 1 && others.every((o) => o.rank > 1)) wonRanked = true;
    }
    if (isGame(r.timeControlId)) {
      const points = me.score.points ?? 0;
      totalXp += gameXp(points, completed);
      if (completed) sessions++;
      if (points > 0) {
        dates.add(localDateString(new Date(r.finishedAtMs)));
        exercisesDone.add(r.exerciseId);
      }
      bestGamePoints = Math.max(bestGamePoints, points);
      continue;
    }
    if (isHold(r.timeControlId)) {
      const holdMs = me.score.holdMs ?? 0;
      totalXp += holdXp(holdMs, completed);
      if (completed) sessions++;
      if (holdMs > 0) {
        dates.add(localDateString(new Date(r.finishedAtMs)));
        exercisesDone.add(r.exerciseId);
      }
      longestHoldMs = Math.max(longestHoldMs, holdMs);
      continue;
    }
    totalXp += sessionXp(reps, qualitySum, completed);
    totalReps += reps;
    if (completed) sessions++;
    if (reps > 0) {
      const date = localDateString(new Date(r.finishedAtMs));
      dates.add(date);
      if (date === today) todayReps += reps;
      exercisesDone.add(r.exerciseId);
      perExerciseBest.set(r.exerciseId, Math.max(perExerciseBest.get(r.exerciseId) ?? 0, reps));
    }
    if (reps >= 10 && qualitySum / reps >= 0.9) perfect = true;
    if (completed && r.timeControlId === 'endurance' && reps > 0) endurance = true;
  }

  const streak = computeStreak(dates, today);
  const level = levelInfo(totalXp);
  const unlocked = new Set<AchievementId>();
  const unlock = (id: AchievementId, condition: boolean) => condition && unlocked.add(id);
  unlock('firstRep', totalReps >= 1);
  unlock('firstSession', sessions >= 1);
  unlock('reps100', totalReps >= 100);
  unlock('reps1000', totalReps >= 1000);
  unlock('streak3', streak.best >= 3);
  unlock('streak7', streak.best >= 7);
  unlock('perfectForm', perfect);
  unlock('allRounder', exercisesDone.has('pushup') && exercisesDone.has('pullup') && exercisesDone.has('muscleup'));
  unlock('endurance', endurance);
  unlock('pullups10', (perExerciseBest.get('pullup') ?? 0) >= 10);
  unlock('firstMuscleup', (perExerciseBest.get('muscleup') ?? 0) >= 1);
  unlock('pushups50', (perExerciseBest.get('pushup') ?? 0) >= 50);
  unlock('handstand30', longestHoldMs >= 30_000);
  unlock('flappy10', bestGamePoints >= 10);
  unlock('firstWin', wonRanked);

  return {
    totalXp,
    level,
    rank: rankForLevel(level.level),
    streak,
    todayReps,
    dailyGoal: DAILY_GOAL_REPS,
    totalReps,
    sessions,
    achievements: unlocked,
  };
}

/** What a just-finished session changed: drives the celebration on the results screen. */
export interface SessionGains {
  xp: number;
  before: Progress;
  after: Progress;
  leveledUp: boolean;
  newAchievements: AchievementId[];
  /** Previous best for this competition, in its unit (reps or seconds; 0 = first full session). */
  previousBest: number;
  isPersonalBest: boolean;
  /** Daily goal reached by this session. */
  goalReached: boolean;
}

export function computeGains(history: readonly MatchResult[], result: MatchResult, now: Date): SessionGains {
  const without = history.filter((r) => r.matchId !== result.matchId);
  const before = computeProgress(without, now);
  const after = computeProgress([...without, result], now);
  const previousBest = personalBest(without, result.exerciseId, result.timeControlId);
  const score = scoreValue(result);
  return {
    xp: after.totalXp - before.totalXp,
    before,
    after,
    leveledUp: after.level.level > before.level.level,
    newAchievements: ACHIEVEMENTS.map((a) => a.id).filter(
      (id) => after.achievements.has(id) && !before.achievements.has(id),
    ),
    previousBest,
    isPersonalBest: result.finishReason === 'time' && score > previousBest && score > 0,
    goalReached: before.todayReps < before.dailyGoal && after.todayReps >= after.dailyGoal,
  };
}
