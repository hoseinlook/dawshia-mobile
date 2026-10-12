import { format } from '../../i18n/format';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import type { Messages } from '../../i18n/messages/fa';
import { Notify, type ServerNotification } from '../../services/remote/notifications';

export type NoticeKind = 'friendRequest' | 'friendAccepted' | 'challenge' | 'message';

/** What to tell the user about a server notification, and where tapping it goes. */
export interface Notice {
  kind: NoticeKind;
  userId: string;
  username: string;
  title: string;
  body: string;
  /** App path to open, e.g. "/friends" or "/chat/<id>?username=…". */
  path: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Turns a server notification into a notice, or null for ones we don't announce. */
export function describeNotice(n: ServerNotification, m: Messages): Notice | null {
  const c = n.content;
  switch (n.code) {
    case Notify.FriendRequest:
    case Notify.FriendAccepted: {
      const username = str(c.username);
      if (!n.senderId || !username) return null;
      const request = n.code === Notify.FriendRequest;
      return {
        kind: request ? 'friendRequest' : 'friendAccepted',
        userId: n.senderId,
        username,
        title: format(request ? m.notices.friendRequest : m.notices.friendAccepted, { username }),
        body: request ? m.notices.friendRequestText : m.notices.friendAcceptedText,
        path: request ? '/friends' : `/player/${encodeURIComponent(n.senderId)}`,
      };
    }
    case Notify.Challenge: {
      const userId = str(c.userId);
      const username = str(c.username);
      if (!userId || !username) return null;
      return {
        kind: 'challenge',
        userId,
        username,
        title: format(m.challenge.incoming, { username }),
        body: `${exerciseText(m, str(c.exercise)).name} · ${timeControlText(m, str(c.timeControl)).label}`,
        // The fight card shows on the tabs while the challenge is open.
        path: '/',
      };
    }
    case Notify.ChatMessage: {
      const userId = str(c.userId);
      const username = str(c.username);
      if (!userId) return null;
      return {
        kind: 'message',
        userId,
        username,
        title: format(m.messages.newFrom, { username }),
        body: str(c.text),
        path: `/chat/${encodeURIComponent(userId)}?username=${encodeURIComponent(username)}`,
      };
    }
    default:
      return null;
  }
}
