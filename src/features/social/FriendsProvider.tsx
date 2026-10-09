import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useServices } from '../../services/ServicesProvider';
import type { FriendInfo } from '../../services/types';

const REFRESH_MS = 30_000;

interface FriendsContextValue {
  available: boolean;
  friends: FriendInfo[] | null;
  error: boolean;
  /** Incoming friend requests (for the tab badge). */
  incomingCount: number;
  refresh(): Promise<void>;
  add(username: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

/** Friends list shared by the Friends tab and its badge; refreshed every 30 s while the app is open. */
export function FriendsProvider({ children }: { children: ReactNode }) {
  const { social } = useServices();
  const [friends, setFriends] = useState<FriendInfo[] | null>(null);
  const [error, setError] = useState(false);
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    if (!social.available || loading.current) return;
    loading.current = true;
    try {
      setFriends(await social.listFriends());
      setError(false);
    } catch {
      setError(true);
    } finally {
      loading.current = false;
    }
  }, [social]);

  useEffect(() => {
    if (!social.available) return;
    const first = setTimeout(refresh, 0);
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [social, refresh]);

  const add = useCallback(
    async (username: string) => {
      await social.addFriend(username);
      await refresh();
    },
    [social, refresh],
  );
  const remove = useCallback(
    async (userId: string) => {
      await social.removeFriend(userId);
      await refresh();
    },
    [social, refresh],
  );

  const value = useMemo(
    () => ({
      available: social.available,
      friends: social.available ? friends : null,
      error,
      incomingCount: social.available ? (friends?.filter((f) => f.state === 'incoming').length ?? 0) : 0,
      refresh,
      add,
      remove,
    }),
    [social.available, friends, error, refresh, add, remove],
  );
  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  const value = useContext(FriendsContext);
  if (!value) throw new Error('useFriends must be used inside <FriendsProvider>');
  return value;
}
