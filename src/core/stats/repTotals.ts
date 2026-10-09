import type { ExerciseId } from '../exercises/types';
import { isGame, isHold } from '../match/timeControls';
import type { MatchResult } from '../match/types';

/** Totals the profile shows for one movement: valid reps, or seconds held for holds. */
export interface ExerciseTotals {
  exerciseId: ExerciseId;
  today: number;
  month: number;
  total: number;
}

/** Calendar date in the device's time zone, e.g. "2026-10-08". */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Sums the local athlete's valid reps (or seconds held, for holds) per exercise for today, this calendar
 * month and all time. Every listed exercise appears, even with zero reps.
 */
export function summarizeReps(
  results: readonly MatchResult[],
  exerciseIds: readonly ExerciseId[],
  now: Date,
): ExerciseTotals[] {
  const today = localDateString(now);
  const month = today.slice(0, 7);
  const totals = new Map<ExerciseId, ExerciseTotals>(
    exerciseIds.map((id) => [id, { exerciseId: id, today: 0, month: 0, total: 0 }]),
  );

  for (const result of results) {
    const entry = totals.get(result.exerciseId);
    const me = result.standings.find((s) => s.participant.isLocal);
    if (!entry || !me) continue;
    const reps = isHold(result.timeControlId)
      ? Math.floor((me.score.holdMs ?? 0) / 1000)
      : isGame(result.timeControlId)
        ? (me.score.points ?? 0)
        : me.score.reps;
    const date = localDateString(new Date(result.finishedAtMs));
    entry.total += reps;
    if (date.slice(0, 7) === month) entry.month += reps;
    if (date === today) entry.today += reps;
  }
  return [...totals.values()];
}
