/**
 * Original synthesized match sounds (see scripts/generate-sounds.py).
 * Loops are WAV so they repeat without gaps.
 */
export const MATCH_SOUNDS = {
  countdown: require('../../../assets/sounds/match/countdown.wav'),
  start: require('../../../assets/sounds/match/start.wav'),
  music: require('../../../assets/sounds/match/music.wav'),
  intense: require('../../../assets/sounds/match/intense.wav'),
  tick: require('../../../assets/sounds/match/tick.wav'),
  buzzer: require('../../../assets/sounds/match/buzzer.wav'),
  fanfare: require('../../../assets/sounds/match/fanfare.wav'),
} as const;

/** When the music switches to the intense loop: last 15 s of a 1-minute match, last 30 s otherwise. */
export function intenseFromMs(durationMs: number): number {
  return durationMs <= 60_000 ? 15_000 : 30_000;
}

/** Final seconds with a clock tick. */
export const TICK_FROM_MS = 5_000;

export type MusicStage = 'off' | 'normal' | 'intense';

/** Which music should play for the current match moment (pure, for testing). */
export function musicStage(status: string, remainingMs: number, durationMs: number): MusicStage {
  if (status !== 'live') return 'off';
  return remainingMs <= intenseFromMs(durationMs) ? 'intense' : 'normal';
}
