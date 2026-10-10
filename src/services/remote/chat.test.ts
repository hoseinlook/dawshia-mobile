import { toChatMessage } from './chat';
import { Notify, parseNotifications } from './notifications';

const raw = {
  channel_id: '4.a.b.',
  message_id: 'm1',
  sender_id: 'u1',
  username: 'sara',
  content: '{"text":"سلام! gg"}',
  create_time: '2026-10-10T12:00:00Z',
};

describe('chat messages', () => {
  it('reads the text, sender and time', () => {
    expect(toChatMessage(raw)).toEqual({
      id: 'm1',
      senderId: 'u1',
      username: 'sara',
      text: 'سلام! gg',
      at: Date.parse('2026-10-10T12:00:00Z'),
    });
  });

  it('skips messages that are not text', () => {
    expect(toChatMessage({ ...raw, content: '{"emoji":"x"}' })).toBeNull();
    expect(toChatMessage({ ...raw, content: 'not json' })).toBeNull();
  });

  it('parses chat notifications', () => {
    const [n] = parseNotifications({
      notifications: [{ code: 102, content: '{"userId":"u1","username":"sara","text":"gg"}' }],
    });
    expect(n.code).toBe(Notify.ChatMessage);
    expect(n.content).toEqual({ userId: 'u1', username: 'sara', text: 'gg' });
  });
});
