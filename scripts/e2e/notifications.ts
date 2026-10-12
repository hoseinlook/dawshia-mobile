/**
 * End-to-end check of the friend notifications the app announces (request, accepted) on a
 * quiet background socket, using the app's own client and parsing code.
 *
 *   npx tsx scripts/e2e/notifications.ts [http://localhost:7350]
 */
import { en } from '../../src/i18n/messages/en';
import { describeNotice, type Notice } from '../../src/features/notices/describeNotice';
import { NakamaApi } from '../../src/services/remote/nakamaApi';
import { NakamaSocket } from '../../src/services/remote/nakamaSocket';
import { parseNotifications } from '../../src/services/remote/notifications';

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

/** A background-style socket (no online status) collecting the notices the app would show. */
async function listen(token: string) {
  const notices: Notice[] = [];
  const socket = new NakamaSocket(BASE);
  await socket.connect(token, { status: false });
  socket.on('notifications', (payload) => {
    for (const n of parseNotifications(payload)) {
      const notice = describeNotice(n, en);
      if (notice) notices.push(notice);
    }
  });
  const next = async (kind: Notice['kind']) => {
    for (let i = 0; i < 50; i++) {
      const found = notices.find((n) => n.kind === kind);
      if (found) return found;
      await sleep(100);
    }
    return null;
  };
  return { socket, next };
}

async function main() {
  const tag = Date.now().toString(36);
  const a = await player(`nota${tag}`);
  const b = await player(`notb${tag}`);
  const la = await listen(a.token);
  const lb = await listen(b.token);

  console.log('friend request');
  await a.rpc('add_friend', { username: b.name });
  const request = await lb.next('friendRequest');
  check(request?.userId === a.userId && request.username === a.name, 'B is told who sent the request');
  check(request?.title === `${a.name} wants to be your friend` && request.path === '/friends', 'the notice opens Friends');

  console.log('accepted');
  await b.rpc('add_friend', { username: a.name });
  const accepted = await la.next('friendAccepted');
  check(accepted?.userId === b.userId && accepted.path === `/player/${b.userId}`, 'A is told B accepted, opening B’s page');

  la.socket.close();
  lb.socket.close();
  console.log('\nE2E notifications OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
