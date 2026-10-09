import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

import { useSettings } from '../settings/SettingsProvider';
import { CHEER_CLIPS, pickNext } from './cheers';

/**
 * Returns `cheer()`, which plays a random encouragement clip in the current
 * language (never the same one twice in a row). Silent when sounds are off.
 */
export function useCheers(): () => void {
  const { settings } = useSettings();
  const playersRef = useRef<AudioPlayer[]>([]);
  const lastRef = useRef(-1);

  useEffect(() => {
    if (!settings.soundEnabled) return;
    // Mix with the athlete's own music instead of pausing it.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => {},
    );
    const players = CHEER_CLIPS[settings.locale].map((clip) => createAudioPlayer(clip));
    playersRef.current = players;
    lastRef.current = -1;
    return () => {
      for (const p of players) p.remove();
      playersRef.current = [];
    };
  }, [settings.locale, settings.soundEnabled]);

  return useCallback(() => {
    const players = playersRef.current;
    if (players.length === 0) return;
    const index = pickNext(players.length, lastRef.current);
    lastRef.current = index;
    const player = players[index];
    player.seekTo(0).catch(() => {});
    player.play();
  }, []);
}
