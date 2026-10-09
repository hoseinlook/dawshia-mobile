/**
 * End-to-end check of friends, presence, activity, VS profiles and quick chat
 * against a running Dawshia server, using the app's own client code.
 *
 *   npx tsx scripts/e2e/social.ts [http://localhost:7350]
 */
import { NakamaApi } from '../../src/services/remote/nakamaApi';
import { NakamaSocket } from '../../src/services/remote/nakamaSocket';
import { findOnlineMatch } from '../../src/services/remote/onlineMatch';
import type { FriendInfo, LiveEvent } from '../../src/services/types';

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
  return { name, token, userId: uid, rpc, friends: async () => (await rpc<{ friends: FriendInfo[] }>('get_friends')).friends };
}

async function main() {
  const tag = Date.now().toString(36);
  const a = await player(`soca${tag}`);
  const b = await player(`socb${tag}`);

  console.log('friends');
  await a.rpc('update_public_profile', { level: 4, rank: 'fighter' });
  await a.rpc('add_friend', { username: b.name });
  check((await b.friends()).some((f) => f.userId === a.userId && f.state === 'incoming'), 'B sees A’s request as incoming');
  check((await a.friends()).some((f) => f.userId === b.userId && f.state === 'outgoing'), 'A sees the request as outgoing');
  await b.rpc('add_friend', { username: a.name });
  const bFriendsAfter = await b.friends();
  check(bFriendsAfter.some((f) => f.userId === a.userId && f.state === 'friend' && f.level === 4 && f.rank === 'fighter'), 'accepting makes them friends; A’s level/rank are visible');

  console.log('presence');
  check((await a.friends()).find((f) => f.userId === b.userId)?.online === false, 'B is offline without a socket');
  const presence = new NakamaSocket(BASE);
  await presence.connect(b.token, { status: true });
  await sleep(500);
  check((await a.friends()).find((f) => f.userId === b.userId)?.online === true, 'B is online while the app is open');
  presence.close();
  await sleep(1500);
  check((await a.friends()).find((f) => f.userId === b.userId)?.online === false, 'B goes offline when the app closes');

  console.log('last practice');
  await a.rpc('submit_practice', { exercise: 'pullup', timeControl: 'blitz', reps: 17, localDate: '2026-10-09' });
  const seen = (await b.friends()).find((f) => f.userId === a.userId)?.lastActivity;
  check(seen?.exercise === 'pullup' && seen.score === 17 && seen.mode === 'practice', 'B sees A’s last practice (17 pull-ups)');

  console.log('VS profile + quick chat');
  const request = (n: string) => ({ mode: 'ranked' as const, exerciseId: 'dip', timeControlId: 'bullet' as const, player: { id: n, displayName: n } });
  const [ma, mb] = await Promise.all([
    findOnlineMatch({ token: a.token, selfUserId: a.userId, request: request('a'), baseUrl: BASE }),
    findOnlineMatch({ token: b.token, selfUserId: b.userId, request: request('b'), baseUrl: BASE }),
  ]);
  const opponentOfB = mb.config.participants.find((p) => !p.isLocal);
  check(opponentOfB?.displayName === a.name && opponentOfB.profile?.level === 4 && opponentOfB.profile.rank === 'fighter' && opponentOfB.profile.rating === 1500, 'B’s VS screen shows A’s name, level, rank and rating');
  const chat = new Promise<LiveEvent>((resolve) => mb.match.subscribeLive((e) => e.type === 'chat' && resolve(e)));
  ma.match.sendLive({ type: 'chat', participantId: a.userId, code: 'goodLuck' });
  const received = await Promise.race([chat, sleep(5000).then(() => null)]);
  check(received?.type === 'chat' && received.code === 'goodLuck' && received.participantId === a.userId, 'B receives A’s quick chat');
  ma.match.close();
  mb.match.close();
  console.log('\nE2E social OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
