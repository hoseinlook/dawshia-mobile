import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { MatchResult } from '../../core/match/types';
import { useServices } from '../../services/ServicesProvider';

/** Session history from the device, reloaded every time the screen gains focus. */
export function useHistory(): MatchResult[] | null {
  const { history } = useServices();
  const [results, setResults] = useState<MatchResult[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      history.list().then((r) => !cancelled && setResults(r));
      return () => {
        cancelled = true;
      };
    }, [history]),
  );
  return results;
}
