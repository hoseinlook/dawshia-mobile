/**
 * End-to-end check of friend fight requests against a running Dawshia server,
 * using the app's own client code.
 *
 *   npx tsx scripts/e2e/challenge.ts [http://localhost:7350]
 */
import { NakamaApi } from '../../src/services/remote/nakamaApi';
import { NakamaSocket } from '../../src/services/remote/nakamaSocket';
import { parseNotifications, toChallengeInvite } from '../../src/services/remote/notifications';
import { joinChallengeMatch } from '../../src/services/remote/onlineMatch';
import { ChallengeError, type ChallengeInvite, type ChallengeMatch } from '../../src/services/types';

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
type Player = Awaited<ReturnType<typeof player>>;

/** The app's presence socket: online status + incoming challenges. */
async function online(p: Player) {
  const socket = new NakamaSocket(BASE);
  await socket.connect(p.token, { status: true });
  const invites: ChallengeInvite[] = [];
  socket.on('notifications', (payload) => {
    for (const n of parseNotifications(payload)) {
      const invite = toChallengeInvite(n);
      if (invite) invites.push(invite);
    }
  });
  await sleep(300);
  return { socket, invites };
}

const challenge = (from: Player, to: Player, exercise = 'pushup', timeControl = 'bullet') =>
  from.rpc<ChallengeMatch>('challenge_friend', { userId: to.userId, exercise, timeControl });

const join = (
  p: Player,
  c: ChallengeMatch,
  timeControlId: 'bullet' | 'flight' = 'bullet',
  exerciseId = 'pushup',
  signal?: AbortSignal,
) =>
  joinChallengeMatch({
    token: p.token,
    selfUserId: p.userId,
    baseUrl: BASE,
    signal,
    request: { mode: 'friendly', exerciseId, timeControlId, player: { id: p.userId, displayName: p.name }, challenge: c },
  });

async function rejects(promise: Promise<unknown>): Promise<Error | null> {
  try {
    await promise;
    return null;
  } catch (e) {
    return e as Error;
  }
}

async function main() {
  const tag = Date.now().toString(36);
  const a = await player(`cha${tag}`);
  const b = await player(`chb${tag}`);
  const stranger = await player(`chc${tag}`);
  await a.rpc('add_friend', { username: b.name });
  await b.rpc('add_friend', { username: a.name });

  console.log('who can be challenged');
  check(/offline/.test((await rejects(challenge(a, b)))?.message ?? ''), 'an offline friend cannot be challenged');
  const bApp = await online(b);
  check(/not your friend/.test((await rejects(challenge(stranger, b)))?.message ?? ''), 'a stranger cannot challenge');
  check(await rejects(challenge(a, a)), 'you cannot challenge yourself');
  check(await rejects(challenge(a, b, 'pushup', 'flight-nope')), 'unknown competitions are refused');

  console.log('decline');
  const first = await challenge(a, b);
  const aWaiting = rejects(join(a, first));
  await sleep(500);
  const invite = bApp.invites.find((x) => x.matchId === first.matchId);
  check(invite?.userId === a.userId && invite.username === a.name, 'B receives A’s fight request');
  check(invite?.exerciseId === 'pushup' && invite.timeControlId === 'bullet', 'it names the movement and competition');
  check(invite && invite.expiresAt > Date.now() + 50_000, 'it can be accepted for about a minute');
  await b.rpc('decline_challenge', { matchId: invite!.matchId, userId: invite!.userId });
  const declined = await aWaiting;
  check(declined instanceof ChallengeError && declined.reason === 'declined', 'A is told B said no');
  check((await rejects(join(b, first))) instanceof ChallengeError, 'the declined match is closed');

  console.log('accept');
  const second = await challenge(a, b, 'flappy', 'flight');
  const aJoin = join(a, second, 'flight', 'flappy');
  await sleep(500);
  const bJoin = await join(b, bApp.invites.find((x) => x.matchId === second.matchId)!, 'flight', 'flappy');
  const aJoined = await aJoin;
  check(aJoined.config.participants.length === 2 && bJoin.config.participants.length === 2, 'both players are in the match');
  check(aJoined.config.mode === 'friendly' && aJoined.config.timeControlId === 'flight', 'it is a friendly Flappy Push match');
  check(aJoined.config.seed === bJoin.config.seed, 'both fly the same course');
  check((await rejects(join(stranger, second, 'flight', 'flappy'))) !== null, 'nobody else can join the private match');
  aJoined.match.close();
  bJoin.match.close();

  console.log('cancel');
  const third = await challenge(a, b);
  const abort = new AbortController();
  const aCancelled = rejects(join(a, third, 'bullet', 'pushup', abort.signal));
  await sleep(500);
  abort.abort(); // the waiting screen's Cancel
  check(/cancelled/.test((await aCancelled)?.message ?? ''), 'A can stop waiting');
  await sleep(300);
  const late = await rejects(join(b, third));
  check(late instanceof ChallengeError && late.reason === 'expired', 'B accepting a cancelled request is told it ended');
  bApp.socket.close();
  console.log('\nAll challenge checks passed.');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
