/**
 * End-to-end check of chat between players after a 1v1, against a running
 * Dawshia server, using the app's own client code.
 *
 *   npx tsx scripts/e2e/chat.ts [http://localhost:7350]
 */
import { NakamaApi } from '../../src/services/remote/nakamaApi';
import { NakamaSocket } from '../../src/services/remote/nakamaSocket';
import { openDirectChat } from '../../src/services/remote/chat';
import { Notify, parseNotifications } from '../../src/services/remote/notifications';
import { findOnlineMatch } from '../../src/services/remote/onlineMatch';
import type { ChatMessage, ChatPartner, PlayerDetails } from '../../src/services/types';

const BASE = process.argv[2] ?? 'http://localhost:7350';

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function player(name: string) {
  const api = new NakamaApi(BASE);
  const { token } = await api.authenticateEmail({ email: `${name}@e2e.test`, password: 'e2e-password-123', create: true, username: name });
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const { uid } = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { uid: string };
  const rpc = <T>(id: string, payload: unknown = {}) => api.rpc<T>(token, id, payload);
  return { name, token, userId: uid, rpc };
}

async function rejects(promise: Promise<unknown>): Promise<Error | null> {
  try {
    const value = await promise;
    (value as { close?: () => void })?.close?.();
    return null;
  } catch (e) {
    return e as Error;
  }
}

async function main() {
  const tag = Date.now().toString(36);
  const a = await player(`cta${tag}`);
  const b = await player(`ctb${tag}`);
  const stranger = await player(`ctc${tag}`);
  const open = (from: typeof a, to: typeof a) => openDirectChat({ token: from.token, userId: to.userId, baseUrl: BASE });

  console.log('before playing');
  check(/1v1/.test((await rejects(open(a, b)))?.message ?? ''), 'players who never met cannot chat');
  check((await a.rpc<{ partners: ChatPartner[] }>('get_chat_partners')).partners.length === 0, 'no chat partners yet');

  console.log('play a 1v1 (A leaves during the countdown: forfeit)');
  // A competition nobody else queues for, so A and B meet each other.
  const request = (n: string) => ({ mode: 'ranked' as const, exerciseId: 'lsit', timeControlId: 'resistance' as const, player: { id: n, displayName: n } });
  const [ma, mb] = await Promise.all([
    findOnlineMatch({ token: a.token, selfUserId: a.userId, request: request('a'), baseUrl: BASE }),
    findOnlineMatch({ token: b.token, selfUserId: b.userId, request: request('b'), baseUrl: BASE }),
  ]);
  const finished = new Promise((resolve) => mb.match.subscribeResult(resolve));
  ma.match.ready();
  mb.match.ready();
  await sleep(1000);
  ma.match.close();
  await Promise.race([finished, sleep(5000)]);
  mb.match.close();
  await sleep(300);

  console.log('chat');
  const partners = (await b.rpc<{ partners: ChatPartner[] }>('get_chat_partners')).partners;
  check(partners.length === 1 && partners[0].userId === a.userId && partners[0].username === a.name, 'B’s chat list shows A');
  const details = await b.rpc<PlayerDetails>('get_player', { userId: a.userId, today: '2026-10-10' });
  check(details.canChat === true, 'A’s player page lets B message them');
  check((await stranger.rpc<PlayerDetails>('get_player', { userId: a.userId, today: '2026-10-10' })).canChat === false, '…but not a stranger');
  check(/1v1/.test((await rejects(open(stranger, a)))?.message ?? ''), 'a stranger cannot open a chat with A');

  const bPresence = new NakamaSocket(BASE);
  await bPresence.connect(b.token, { status: true });
  const notified = new Promise<Record<string, unknown>>((resolve) =>
    bPresence.on('notifications', (p) => {
      for (const n of parseNotifications(p)) if (n.code === Notify.ChatMessage) resolve(n.content);
    }),
  );

  const chatA = await open(a, b);
  const chatB = await open(b, a);
  const toB = new Promise<ChatMessage>((resolve) => chatB.subscribe(resolve));
  await chatA.send('  gg! rematch?  ');
  const got = await Promise.race([toB, sleep(5000).then(() => null)]);
  check(got?.text === 'gg! rematch?' && got.senderId === a.userId && got.username === a.name, 'B receives A’s message live (trimmed)');
  const note = await Promise.race([notified, sleep(5000).then(() => null)]);
  check(note?.userId === a.userId && note.text === 'gg! rematch?', 'B’s app is notified (unread badge)');

  await chatB.send('سلام! باشه 💪');
  await sleep(500);
  check(/too long/.test((await rejects(chatA.send('x'.repeat(501))))?.message ?? ''), 'messages over 500 characters are refused');
  check(/empty/.test((await rejects(chatA.send('   ')))?.message ?? ''), 'empty messages are refused');
  chatA.close();
  chatB.close();

  const again = await open(a, b);
  check(again.history.length === 2, 'history is kept');
  check(again.history[0].text === 'سلام! باشه 💪' && again.history[1].text === 'gg! rematch?', 'newest first, Persian and emoji intact');
  again.close();
  bPresence.close();

  console.log('rooms are closed');
  const socket = new NakamaSocket(BASE);
  await socket.connect(stranger.token);
  check(await rejects(socket.request({ channel_join: { target: 'lobby', type: 1, persistence: true, hidden: false } })), 'public chat rooms are not allowed');
  socket.close();

  console.log('\nE2E chat OK');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
