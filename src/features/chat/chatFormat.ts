import type { ChatMessage, ChatPartner } from '../../services/types';

/** Messages from the same sender this close together are drawn as one group. */
const GROUP_GAP_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/** When the conversation last moved: its newest message, or the 1v1 that opened it. */
export function conversationAt(p: ChatPartner): number {
  return Math.max(p.lastMessage?.at ?? 0, p.lastPlayedAt);
}

/** Inbox order: unread first, then the most recently active conversation. */
export function sortConversations(partners: ChatPartner[], unread: Record<string, number>): ChatPartner[] {
  return [...partners].sort(
    (a, b) =>
      Number((unread[b.userId] ?? 0) > 0) - Number((unread[a.userId] ?? 0) > 0) ||
      conversationAt(b) - conversationAt(a),
  );
}

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days between two times (0 = same day, 1 = yesterday…). */
export function daysBetween(at: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
}

export type ChatRowItem =
  | { kind: 'day'; key: string; at: number }
  | {
      kind: 'message';
      key: string;
      message: ChatMessage;
      mine: boolean;
      /** First / last message of a run from the same sender (shapes the bubble corners). */
      groupStart: boolean;
      groupEnd: boolean;
    };

/**
 * Turns messages (newest first, as the inverted list wants them) into rows with
 * day separators and sender groups. Only the last message of a group shows its time.
 */
export function buildChatRows(messages: ChatMessage[], myId: string | undefined): ChatRowItem[] {
  const rows: ChatRowItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const newer = messages[i - 1];
    const older = messages[i + 1];
    const sameRun = (a: ChatMessage | undefined) =>
      a !== undefined &&
      a.senderId === message.senderId &&
      Math.abs(a.at - message.at) <= GROUP_GAP_MS &&
      daysBetween(Math.min(a.at, message.at), Math.max(a.at, message.at)) === 0;
    rows.push({
      kind: 'message',
      key: message.id,
      message,
      mine: message.senderId === myId,
      groupStart: !sameRun(older),
      groupEnd: !sameRun(newer),
    });
    // The list is inverted: a separator after a message is drawn above it.
    if (!older || daysBetween(older.at, message.at) !== 0) {
      rows.push({ kind: 'day', key: `day-${startOfDay(message.at)}`, at: message.at });
    }
  }
  return rows;
}
