import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { parseNotifications, toChallengeInvite } from '../../services/remote/notifications';
import { useServices } from '../../services/ServicesProvider';
import type { ChallengeInvite } from '../../services/types';
import { haptics } from '../../ui/haptics';
import { usePresence } from './usePresence';

interface ChallengesContextValue {
  /** The newest challenge still open, if any. */
  incoming: ChallengeInvite | null;
  accept(invite: ChallengeInvite): void;
  decline(invite: ChallengeInvite): void;
  /** Sends a challenge to an online friend and opens the waiting screen. */
  send(friend: { userId: string; username: string }, exerciseId: string, timeControlId: string): Promise<void>;
}

const ChallengesContext = createContext<ChallengesContextValue | null>(null);

/** Session route params for a friend challenge. */
export function challengeRoute(
  c: { matchId: string; expiresAt: number; exerciseId: string; timeControlId: string },
  opponent: string,
  role: 'sent' | 'received',
) {
  return {
    pathname: '/session/[exerciseId]' as const,
    params: {
      exerciseId: c.exerciseId,
      timeControl: c.timeControlId,
      mode: 'friendly',
      matchId: c.matchId,
      expiresAt: String(c.expiresAt),
      opponent,
      role,
    },
  };
}

/**
 * Friend challenges: keeps the presence socket open (online status) and
 * collects incoming challenges from it; sends challenges to friends.
 */
export function ChallengesProvider({ children }: { children: ReactNode }) {
  const { social } = useServices();
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const onNotifications = useCallback((payload: unknown) => {
    const fresh = parseNotifications(payload)
      .map(toChallengeInvite)
      .filter((x): x is ChallengeInvite => x !== null);
    if (fresh.length === 0) return;
    haptics.success();
    setNow(Date.now());
    // One open challenge per friend: a new one replaces the old.
    setInvites((prev) => [...prev.filter((p) => !fresh.some((x) => x.userId === p.userId)), ...fresh]);
  }, []);
  usePresence(onNotifications);

  // Drop expired challenges.
  useEffect(() => {
    if (invites.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [invites.length]);
  const open = invites.filter((x) => x.expiresAt > now);
  const incoming = open.length > 0 ? open[open.length - 1] : null;

  const dismiss = useCallback((matchId: string) => setInvites((prev) => prev.filter((x) => x.matchId !== matchId)), []);
  const accept = useCallback(
    (invite: ChallengeInvite) => {
      dismiss(invite.matchId);
      router.push(challengeRoute(invite, invite.username, 'received'));
    },
    [dismiss],
  );
  const decline = useCallback(
    (invite: ChallengeInvite) => {
      dismiss(invite.matchId);
      social.declineChallenge(invite).catch(() => {
        // The challenge simply expires on their side.
      });
    },
    [dismiss, social],
  );
  const send = useCallback(
    async (friend: { userId: string; username: string }, exerciseId: string, timeControlId: string) => {
      const c = await social.challengeFriend(
        friend.userId,
        exerciseId,
        timeControlId as ChallengeInvite['timeControlId'],
      );
      router.replace(challengeRoute({ ...c, exerciseId, timeControlId }, friend.username, 'sent'));
    },
    [social],
  );

  const value = useMemo(() => ({ incoming, accept, decline, send }), [incoming, accept, decline, send]);
  return <ChallengesContext.Provider value={value}>{children}</ChallengesContext.Provider>;
}

export function useChallenges(): ChallengesContextValue {
  const value = useContext(ChallengesContext);
  if (!value) throw new Error('useChallenges must be used inside <ChallengesProvider>');
  return value;
}
