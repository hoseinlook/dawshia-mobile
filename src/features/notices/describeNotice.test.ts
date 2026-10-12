import { en } from '../../i18n/messages/en';
import { Notify } from '../../services/remote/notifications';
import { describeNotice } from './describeNotice';

const n = (code: number, content: Record<string, unknown>, senderId = '') => ({ code, content, senderId });

describe('describeNotice', () => {
  it('announces friend requests and opens Friends', () => {
    expect(describeNotice(n(Notify.FriendRequest, { username: 'sara' }, 'u1'), en)).toMatchObject({
      kind: 'friendRequest',
      userId: 'u1',
      title: 'sara wants to be your friend',
      path: '/friends',
    });
  });

  it('announces accepted requests and opens the player', () => {
    expect(describeNotice(n(Notify.FriendAccepted, { username: 'sara' }, 'u1'), en)).toMatchObject({
      kind: 'friendAccepted',
      title: 'sara accepted your friend request',
      path: '/player/u1',
    });
  });

  it('opens the chat for a message', () => {
    const notice = describeNotice(n(Notify.ChatMessage, { userId: 'u 2', username: 'ali', text: 'gg' }), en);
    expect(notice).toMatchObject({ kind: 'message', body: 'gg', path: '/chat/u%202?username=ali' });
  });

  it('describes a fight request', () => {
    const notice = describeNotice(
      n(Notify.Challenge, { userId: 'u1', username: 'sara', exercise: 'pushup', timeControl: 'bullet' }),
      en,
    );
    expect(notice?.title).toBe('sara challenges you to a fight!');
    expect(notice?.body).toContain('·');
  });

  it('ignores malformed and unrelated notifications', () => {
    expect(describeNotice(n(Notify.FriendRequest, { username: 'sara' }), en)).toBeNull();
    expect(describeNotice(n(Notify.ChallengeDeclined, { matchId: 'm' }), en)).toBeNull();
    expect(describeNotice(n(0, {}), en)).toBeNull();
  });
});
