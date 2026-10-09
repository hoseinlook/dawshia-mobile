export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Linear 0..1 score: `worst` → 0, `best` → 1 (works in either direction). */
export function linearScore(value: number, worst: number, best: number): number {
  return clamp01((value - worst) / (best - worst));
}
