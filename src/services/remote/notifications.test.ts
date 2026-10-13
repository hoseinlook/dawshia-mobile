import { Notify, toChallengeInvite } from './notifications';

describe('toChallengeInvite', () => {
  const content = { matchId: 'm1', userId: 'u1', username: 'ali', exercise: 'pushup', timeControl: 'bullet', expiresAt: 5 };

  it('reads a fight request from any player', () => {
    expect(toChallengeInvite({ code: Notify.Challenge, content: { ...content, friend: false }, senderId: 'u1' })).toEqual({
      matchId: 'm1',
      userId: 'u1',
      username: 'ali',
      exerciseId: 'pushup',
      timeControlId: 'bullet',
      expiresAt: 5,
      friend: false,
    });
  });

  it('treats requests from older servers (no flag) as from a friend', () => {
    expect(toChallengeInvite({ code: Notify.Challenge, content, senderId: 'u1' })?.friend).toBe(true);
  });

  it('ignores other notifications and malformed ones', () => {
    expect(toChallengeInvite({ code: Notify.ChatMessage, content, senderId: 'u1' })).toBeNull();
    expect(toChallengeInvite({ code: Notify.Challenge, content: { userId: 'u1' }, senderId: 'u1' })).toBeNull();
  });
});
