/**
 * Experience points and levels (competence / accomplishment).
 *
 * Every valid rep earns XP, and cleaner reps earn a little more, so good form
 * is rewarded rather than just speed. Finishing a full session adds a bonus.
 */
export const XP_PER_REP = 10;
/** Extra XP for a perfect-quality rep (scaled by quality 0..1). */
export const XP_QUALITY_BONUS = 5;
/** Bonus for not quitting before the clock ends. */
export const XP_COMPLETION_BONUS = 20;

export function sessionXp(reps: number, qualitySum: number, completed: boolean): number {
  if (reps <= 0) return completed ? XP_COMPLETION_BONUS : 0;
  return reps * XP_PER_REP + Math.round(qualitySum * XP_QUALITY_BONUS) + (completed ? XP_COMPLETION_BONUS : 0);
}

/** Total XP needed to reach `level` (level 1 = 0 XP; each level is 100 XP longer than the last). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level spans (current → next). */
  xpForNext: number;
  /** 0..1 progress to the next level. */
  progress: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  // Solve 50·L·(L−1) ≤ xp for the largest integer L.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  return { level, xpIntoLevel: xp - start, xpForNext: span, progress: (xp - start) / span };
}

/** Rank titles unlock at these levels (keys of `ranks` in the i18n messages). */
export const RANKS = [
  { minLevel: 1, id: 'rookie' },
  { minLevel: 3, id: 'fighter' },
  { minLevel: 6, id: 'warrior' },
  { minLevel: 10, id: 'champion' },
  { minLevel: 15, id: 'titan' },
  { minLevel: 20, id: 'legend' },
] as const;

export type RankId = (typeof RANKS)[number]['id'];

export function rankForLevel(level: number): RankId {
  let rank: RankId = 'rookie';
  for (const r of RANKS) if (level >= r.minLevel) rank = r.id;
  return rank;
}
