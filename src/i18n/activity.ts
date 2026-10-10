import { getTimeControl } from '../core/match/timeControls';
import type { Messages } from './messages/fa';

type Fill = (template: string, params?: Record<string, string | number>) => string;

/** A score in its competition's unit: "12 reps", "45 s" or "8 pipes". */
export function formatScore(m: Messages, f: Fill, timeControlId: string, score: number): string {
  const format = getTimeControl(timeControlId).format;
  if (format === 'maxHold') return f(m.game.seconds, { seconds: score });
  if (format === 'game') return f(m.game.pipes, { count: score });
  return f(m.friends.repsScore, { count: score });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(m: Messages, f: Fill, at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return m.friends.justNow;
  if (minutes < 60) return f(m.friends.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return f(m.friends.hoursAgo, { n: hours });
  return f(m.friends.daysAgo, { n: Math.floor(hours / 24) });
}

/** "3 levels above you" / "same level as you" from the viewer's point of view. */
export function levelGap(m: Messages, f: Fill, theirLevel: number, myLevel: number): string {
  const diff = theirLevel - myLevel;
  if (diff === 0) return m.ranking.sameLevel;
  if (diff === 1) return m.ranking.levelAhead;
  if (diff === -1) return m.ranking.levelBehind;
  return diff > 0 ? f(m.ranking.levelsAhead, { n: diff }) : f(m.ranking.levelsBehind, { n: -diff });
}
