import type { ChallengeInvite } from '../types';

/** Notification codes — must match dawshia-server/internal/rpc/challenge.go. */
export const Notify = {
  Challenge: 100,
  ChallengeDeclined: 101,
} as const;

export interface ServerNotification {
  code: number;
  content: Record<string, unknown>;
}

/** Notifications from a socket `notifications` push (content arrives as a JSON string). */
export function parseNotifications(payload: unknown): ServerNotification[] {
  const list = (payload as { notifications?: { code?: number | string; content?: string }[] })?.notifications ?? [];
  const out: ServerNotification[] = [];
  for (const n of list) {
    try {
      out.push({ code: Number(n.code), content: JSON.parse(n.content ?? '{}') as Record<string, unknown> });
    } catch {
      // Not ours / malformed: ignore.
    }
  }
  return out;
}

/** A challenge invite from a NotifyChallenge notification, or null if it is malformed. */
export function toChallengeInvite(n: ServerNotification): ChallengeInvite | null {
  if (n.code !== Notify.Challenge) return null;
  const c = n.content;
  if (typeof c.matchId !== 'string' || typeof c.userId !== 'string' || typeof c.exercise !== 'string') return null;
  return {
    matchId: c.matchId,
    userId: c.userId,
    username: String(c.username ?? ''),
    exerciseId: c.exercise,
    timeControlId: String(c.timeControl) as ChallengeInvite['timeControlId'],
    expiresAt: Number(c.expiresAt) || Date.now() + 60_000,
  };
}
