/**
 * End-to-end check of online 1v1 against a running Dawshia server, using the
 * app's own client code. Two test players queue for Flappy Push, get matched,
 * get ready, fly (ghost birds), score and crash; the server finishes the match
 * with ratings.
 *
 *   npx tsx scripts/e2e/online-1v1.ts [http://localhost:7350]
 */
import type { MatchAction } from '../../src/core/match/types';
import { findOnlineMatch, type OnlineMatch } from '../../src/services/remote/onlineMatch';
import type { LiveEvent, ServerResult } from '../../src/services/types';
import { NAKAMA_SERVER_KEY } from '../../src/services/remote/config';

const BASE = process.argv[2] ?? 'http://localhost:7350';
const SERVER_KEY = NAKAMA_SERVER_KEY;

async function signUp(name: string): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE}/v2/account/authenticate/email?create=true&username=${name}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${SERVER_KEY}:`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${name}@e2e.test`, password: 'e2e-password-123' }),
  });
  const { token } = (await res.json()) as { token: string };
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { uid: string };
  return { token, userId: payload.uid };
}

function waitFor<T>(label: string, setup: (resolve: (v: T) => void) => void, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
    setup((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

type Exercise = { exerciseId: string; timeControlId: 'bullet' | 'resistance' | 'flight' };

async function startMatch(exercise: Exercise) {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const [a, b] = await Promise.all([signUp(`e2ea${tag}`), signUp(`e2eb${tag}`)]);
  const request = (name: string) => ({ mode: 'ranked' as const, ...exercise, player: { id: name, displayName: name } });
  const [ma, mb] = await Promise.all([
    findOnlineMatch({ token: a.token, selfUserId: a.userId, request: request('a'), baseUrl: BASE }),
    findOnlineMatch({ token: b.token, selfUserId: b.userId, request: request('b'), baseUrl: BASE }),
  ]);
  const aActions: MatchAction[] = [];
  const bActions: MatchAction[] = [];
  ma.match.subscribe((x) => aActions.push(x));
  mb.match.subscribe((x) => bActions.push(x));
  ma.match.ready();
  mb.match.ready();
  for (const list of [aActions, bActions]) {
    await waitFor<void>('live', (done) => {
      const t = setInterval(() => {
        if (list.some((x) => x.type === 'serverPhase' && x.status === 'live')) {
          clearInterval(t);
          done();
        }
      }, 50);
    });
  }
  return { a, b, ma: ma.match, mb: mb.match, aActions, bActions };
}

async function repsAndForfeit() {
  console.log('\npush-ups (bullet): reps sync + forfeit');
  const { a, b, ma, mb, bActions } = await startMatch({ exerciseId: 'pushup', timeControlId: 'bullet' });
  ma.publish({ type: 'rep', participantId: a.userId, quality: 0.9, nowMs: Date.now() });
  await new Promise((r) => setTimeout(r, 500));
  ma.publish({ type: 'rep', participantId: a.userId, quality: 0.8, nowMs: Date.now() });
  await waitFor<void>('reps', (done) => {
    const t = setInterval(() => {
      if (bActions.some((x) => x.type === 'syncScore' && x.participantId === a.userId && x.score.reps === 2)) {
        clearInterval(t);
        done();
      }
    }, 50);
  });
  check(true, "opponent sees A's 2 reps live");
  const result = waitFor<ServerResult>('forfeit result', (done) => mb.subscribeResult(done));
  ma.publish({ type: 'abort', nowMs: Date.now() }); // A leaves
  const r = await result;
  check(r.reason === 'forfeit', 'leaving mid-match is a forfeit');
  check(r.ratings[b.userId].after > r.ratings[b.userId].before, 'the player who stayed wins the rating');
  ma.close();
  mb.close();
}

async function holdMatch() {
  console.log('\nhandstand (resistance): longest hold wins');
  const { a, b, ma, mb } = await startMatch({ exerciseId: 'handstand', timeControlId: 'resistance' });
  await new Promise((r) => setTimeout(r, 2500));
  const result = waitFor<ServerResult>('hold result', (done) => ma.subscribeResult(done));
  ma.publish({ type: 'holdBroken', participantId: a.userId, holdMs: 1800, nowMs: Date.now() });
  mb.publish({ type: 'holdBroken', participantId: b.userId, holdMs: 2400, nowMs: Date.now() });
  const r = await result;
  check(r.reason === 'time', 'match ends when both holds broke');
  check(r.ratings[b.userId].after > r.ratings[b.userId].before, 'the longer hold (B, 2.4 s) wins');
  ma.close();
  mb.close();
}

async function main() {
  console.log('flappy push (flight): same map, ghost birds, ratings');
  await flappyMatch();
  await repsAndForfeit();
  await holdMatch();
  console.log('\nE2E 1v1 OK');
}

async function flappyMatch() {
  const tag = Date.now().toString(36);
  const [a, b] = await Promise.all([signUp(`e2ea${tag}`), signUp(`e2eb${tag}`)]);
  console.log(`players ${a.userId.slice(0, 8)} vs ${b.userId.slice(0, 8)}`);

  const request = (name: string) => ({
    mode: 'ranked' as const,
    exerciseId: 'flappy',
    timeControlId: 'flight' as const,
    player: { id: name, displayName: name },
  });
  const [ma, mb] = await Promise.all([
    findOnlineMatch({ token: a.token, selfUserId: a.userId, request: request('a'), baseUrl: BASE }),
    findOnlineMatch({ token: b.token, selfUserId: b.userId, request: request('b'), baseUrl: BASE }),
  ]);
  check(ma.config.id === mb.config.id, 'both players joined the same match');
  check(ma.config.seed === mb.config.seed && ma.config.seed !== undefined, `same map seed for both (${ma.config.seed})`);
  check(ma.config.participants.length === 2 && ma.config.participants.some((p) => !p.isLocal), 'each side sees the opponent');

  const actions = (m: OnlineMatch) => {
    const list: MatchAction[] = [];
    m.subscribe((x) => list.push(x));
    return list;
  };
  const aActions = actions(ma.match);
  const bActions = actions(mb.match);

  const live = (list: MatchAction[]) =>
    waitFor<void>('live', (done) => {
      const t = setInterval(() => {
        if (list.some((x) => x.type === 'serverPhase' && x.status === 'live')) {
          clearInterval(t);
          done();
        }
      }, 50);
    });
  ma.match.ready();
  mb.match.ready();
  await waitFor<void>('countdown', (done) => {
    const t = setInterval(() => {
      if (aActions.some((x) => x.type === 'serverPhase' && x.status === 'countdown')) {
        clearInterval(t);
        done();
      }
    }, 50);
  });
  check(true, 'server started the countdown when both were ready');
  await Promise.all([live(aActions), live(bActions)]);
  check(true, 'match went live on both phones');

  const bird = waitFor<Extract<LiveEvent, { type: 'bird' }>>('ghost bird', (done) =>
    mb.match.subscribeLive((e) => e.type === 'bird' && done(e)),
  );
  ma.match.sendLive({ type: 'bird', participantId: a.userId, y: 0.37 });
  const ghost = await bird;
  check(ghost.participantId === a.userId && Math.abs(ghost.y - 0.37) < 0.01, 'opponent receives the ghost bird position');

  const resultA = waitFor<ServerResult>('result A', (done) => ma.match.subscribeResult(done));
  const resultB = waitFor<ServerResult>('result B', (done) => mb.match.subscribeResult(done));
  ma.match.publish({ type: 'gameOver', participantId: a.userId, points: 1, nowMs: Date.now() });
  await waitFor<void>('opponent score', (done) => {
    const t = setInterval(() => {
      if (bActions.some((x) => x.type === 'syncScore' && x.participantId === a.userId && x.score.done && x.score.points === 1)) {
        clearInterval(t);
        done();
      }
    }, 50);
  });
  check(true, "B sees A's final score (1 pipe, crashed)");
  mb.match.publish({ type: 'gameOver', participantId: b.userId, points: 0, nowMs: Date.now() });

  const [ra, rb] = await Promise.all([resultA, resultB]);
  check(ra.reason === 'time' && rb.reason === 'time', 'server finished the match when both crashed');
  const ratingA = ra.ratings[a.userId];
  const ratingB = ra.ratings[b.userId];
  check(ratingA && ratingB && ratingA.after > ratingA.before && ratingB.after < ratingB.before, `ratings updated: A ${ratingA.before}→${ratingA.after}, B ${ratingB.before}→${ratingB.after}`);

  ma.match.close();
  mb.match.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
