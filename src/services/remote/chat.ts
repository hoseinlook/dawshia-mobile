import type { ChatConversation, ChatMessage } from '../types';
import { NakamaApi, type ServerChannelMessage } from './nakamaApi';
import { NakamaSocket } from './nakamaSocket';

/** Nakama channel type for direct messages. */
const DIRECT_MESSAGE = 2;

export function toChatMessage(m: ServerChannelMessage): ChatMessage | null {
  try {
    const { text } = JSON.parse(m.content) as { text?: unknown };
    if (typeof text !== 'string') return null;
    return {
      id: m.message_id,
      senderId: m.sender_id,
      username: m.username,
      text,
      at: Date.parse(m.create_time) || Date.now(),
    };
  } catch {
    return null;
  }
}

const parseAll = (list: ServerChannelMessage[] | undefined) =>
  (list ?? []).map(toChatMessage).filter((x): x is ChatMessage => x !== null);

/**
 * Opens a Nakama direct-message channel with another player on its own socket.
 * The server only allows it with someone you played a 1v1 with.
 */
export async function openDirectChat(params: {
  token: string;
  userId: string;
  baseUrl?: string;
}): Promise<ChatConversation> {
  const { token, userId } = params;
  const api = new NakamaApi(params.baseUrl);
  const socket = new NakamaSocket(params.baseUrl);
  await socket.connect(token);
  let channelId: string;
  let page: Awaited<ReturnType<NakamaApi['listChannelMessages']>>;
  try {
    const reply = await socket.request({
      channel_join: { target: userId, type: DIRECT_MESSAGE, persistence: true, hidden: false },
    });
    channelId = (reply.channel as { id: string }).id;
    page = await api.listChannelMessages(token, channelId);
  } catch (e) {
    socket.close();
    throw e;
  }
  let cursor = page.next_cursor;

  return {
    history: parseAll(page.messages),
    async loadOlder() {
      if (!cursor) return [];
      const older = await api.listChannelMessages(token, channelId, { cursor });
      cursor = older.next_cursor;
      return parseAll(older.messages);
    },
    async send(text) {
      await socket.request({
        channel_message_send: { channel_id: channelId, content: JSON.stringify({ text: text.trim() }) },
      });
    },
    subscribe(listener) {
      return socket.on('channel_message', (m: ServerChannelMessage) => {
        if (m.channel_id !== channelId) return;
        const message = toChatMessage(m);
        if (message) listener(message);
      });
    },
    onDisconnect(listener) {
      return socket.on('disconnect', listener);
    },
    close() {
      socket.send({ channel_leave: { channel_id: channelId } });
      socket.close();
    },
  };
}
