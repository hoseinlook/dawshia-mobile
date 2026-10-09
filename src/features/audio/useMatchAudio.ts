import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';

import type { FinishReason } from '../../core/match/types';
import { MATCH_SOUNDS, musicStage, TICK_FROM_MS, type MusicStage } from './matchSounds';

const MUSIC_VOLUME = 0.45;
const INTENSE_VOLUME = 0.7;

interface Options {
  enabled: boolean;
  status: string;
  remainingMs: number;
  durationMs: number;
  /** Seconds left in the 3-2-1 countdown, or null. */
  countdownLeft: number | null;
  finishReason: FinishReason | null;
}

type Players = Record<keyof typeof MATCH_SOUNDS, AudioPlayer>;

function play(player: AudioPlayer) {
  player.seekTo(0).catch(() => {});
  player.play();
}

/**
 * Arena-style match audio for timed competitions: countdown beeps, start horn,
 * a background beat that switches to an intense loop near the end, ticking in
 * the final seconds and a buzzer when time runs out.
 */
export function useMatchAudio({ enabled, status, remainingMs, durationMs, countdownLeft, finishReason }: Options) {
  const players = useRef<Players | null>(null);
  const stage = useRef<MusicStage>('off');

  useEffect(() => {
    if (!enabled) return;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    const created = Object.fromEntries(
      Object.entries(MATCH_SOUNDS).map(([key, source]) => [key, createAudioPlayer(source)]),
    ) as Players;
    created.music.loop = true;
    created.intense.loop = true;
    created.music.volume = MUSIC_VOLUME;
    created.intense.volume = INTENSE_VOLUME;
    players.current = created;
    return () => {
      for (const p of Object.values(created)) p.remove();
      players.current = null;
      stage.current = 'off';
    };
  }, [enabled]);

  // 3-2-1 beeps.
  useEffect(() => {
    if (countdownLeft !== null && players.current) play(players.current.countdown);
  }, [countdownLeft]);

  // Music stage: off → normal (with start horn) → intense.
  const next = musicStage(status, remainingMs, durationMs);
  useEffect(() => {
    const p = players.current;
    if (!p || next === stage.current) return;
    const previous = stage.current;
    stage.current = next;
    if (next === 'normal') {
      if (previous === 'off') play(p.start);
      play(p.music);
    } else if (next === 'intense') {
      p.music.pause();
      play(p.intense);
    } else {
      p.music.pause();
      p.intense.pause();
    }
  }, [next]);

  // Clock ticks in the final seconds.
  const tickSecond = status === 'live' && remainingMs <= TICK_FROM_MS ? Math.ceil(remainingMs / 1000) : null;
  useEffect(() => {
    if (tickSecond !== null && tickSecond > 0 && players.current) play(players.current.tick);
  }, [tickSecond]);

  // Buzzer when the clock runs out (not when the athlete quits). One-shot so it
  // keeps playing while the app moves on to the results screen.
  useEffect(() => {
    if (enabled && status === 'finished' && finishReason === 'time') playOneShot(MATCH_SOUNDS.buzzer);
  }, [enabled, status, finishReason]);
}

/** Plays a sound that outlives the current screen, then releases it. */
function playOneShot(source: number, releaseAfterMs = 3000): void {
  const player = createAudioPlayer(source);
  player.play();
  setTimeout(() => player.remove(), releaseAfterMs);
}

/** Fanfare for records and level-ups on the results screen. */
export function playFanfare(): void {
  playOneShot(MATCH_SOUNDS.fanfare);
}
