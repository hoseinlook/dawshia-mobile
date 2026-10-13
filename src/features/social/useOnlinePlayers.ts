import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useServices } from '../../services/ServicesProvider';
import type { RankedPlayer } from '../../services/types';

const REFRESH_MS = 30_000;

/**
 * Other players online right now, refreshed every 30 s while the screen is
 * focused. `null` until the first answer.
 */
export function useOnlinePlayers(): { players: RankedPlayer[] | null; refresh: () => Promise<void> } {
  const { social } = useServices();
  const [players, setPlayers] = useState<RankedPlayer[] | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!social.available) return;
    try {
      const list = await social.listOnlinePlayers();
      if (alive.current) setPlayers(list);
    } catch {
      // Keep the last list; the next refresh tries again.
    }
  }, [social]);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      refresh();
      const id = setInterval(refresh, REFRESH_MS);
      return () => {
        alive.current = false;
        clearInterval(id);
      };
    }, [refresh]),
  );

  return { players, refresh };
}
