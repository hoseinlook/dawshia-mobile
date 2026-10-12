import type { ChatMessage, ChatPartner } from '../../services/types';
import { buildChatRows, daysBetween, sortConversations } from './chatFormat';

const MIN = 60_000;
const day = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime();
const msg = (id: string, senderId: string, at: number): ChatMessage => ({
  id,
  senderId,
  username: senderId,
  text: id,
  at,
});
const partner = (userId: string, lastPlayedAt: number, lastMessageAt?: number): ChatPartner => ({
  userId,
  username: userId,
  online: false,
  lastPlayedAt,
  lastMessage: lastMessageAt ? { senderId: userId, text: 'hi', at: lastMessageAt } : undefined,
});

describe('daysBetween', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysBetween(day(10, 23, 50), day(11, 0, 10))).toBe(1);
    expect(daysBetween(day(11, 1), day(11, 23))).toBe(0);
    expect(daysBetween(day(1), day(11))).toBe(10);
  });
});

describe('sortConversations', () => {
  it('puts unread chats first, then the most recent activity', () => {
    const list = [
      partner('old', day(1)),
      partner('talked', day(2), day(9)),
      partner('played', day(8)),
      partner('new', day(3)),
    ];
    expect(sortConversations(list, { new: 2 }).map((p) => p.userId)).toEqual(['new', 'talked', 'played', 'old']);
  });
});

describe('buildChatRows', () => {
  it('groups close messages from the same sender and separates days', () => {
    // Newest first, like the inverted chat list.
    const messages = [
      msg('c2', 'me', day(11, 9, 3)),
      msg('c1', 'me', day(11, 9, 1)),
      msg('b', 'them', day(11, 9, 0)),
      msg('a', 'them', day(10, 20, 0)),
    ];
    const rows = buildChatRows(messages, 'me');
    expect(rows.map((r) => (r.kind === 'day' ? `day:${new Date(r.at).getDate()}` : r.key))).toEqual([
      'c2',
      'c1',
      'b',
      'day:11',
      'a',
      'day:10',
    ]);
    const byKey = Object.fromEntries(rows.flatMap((r) => (r.kind === 'message' ? [[r.key, r]] : [])));
    expect(byKey.c2).toMatchObject({ mine: true, groupStart: false, groupEnd: true });
    expect(byKey.c1).toMatchObject({ mine: true, groupStart: true, groupEnd: false });
    expect(byKey.b).toMatchObject({ mine: false, groupStart: true, groupEnd: true });
  });

  it('starts a new group after a long pause', () => {
    const rows = buildChatRows(
      [msg('late', 'me', day(11, 10, 0) + 10 * MIN), msg('early', 'me', day(11, 10, 0))],
      'me',
    );
    const early = rows.find((r) => r.key === 'early');
    expect(early).toMatchObject({ groupStart: true, groupEnd: true });
  });
});
