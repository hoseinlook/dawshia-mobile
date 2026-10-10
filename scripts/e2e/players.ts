/**
 * End-to-end check of profile photos, the level ranking and player pages
 * against a running Dawshia server.
 *
 *   npx tsx scripts/e2e/players.ts [http://localhost:7350]
 */
import { NakamaApi } from '../../src/services/remote/nakamaApi';
import { findOnlineMatch } from '../../src/services/remote/onlineMatch';
import type { Avatar, PlayerDetails, RankedPlayer } from '../../src/services/types';

const BASE = process.argv[2] ?? 'http://localhost:7350';

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function player(name: string) {
  const api = new NakamaApi(BASE);
  const { token } = await api.authenticateEmail({ email: `${name}@e2e.test`, password: 'e2e-password-123', create: true, username: name });
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const { uid } = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { uid: string };
  const rpc = <T>(id: string, payload: unknown = {}) => api.rpc<T>(token, id, payload);
  return { name, token, userId: uid, rpc };
}

async function rejects(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

// A tiny valid JPEG header + padding (the server checks the magic bytes and size).
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7)));

async function main() {
  const tag = Date.now().toString(36);
  const a = await player(`plra${tag}`);
  const b = await player(`plrb${tag}`);

  console.log('level ranking');
  // Huge XP so the test players are at the top of a shared dev server.
  // Unique XP per run (level 499) so earlier runs on the same server don't tie with this one.
  const xpA = 50 * 499 * 498 + 2 + (Date.now() % 40_000);
  const xpB = xpA - 1;
  const levelA = await a.rpc<{ level: number; rank: string }>('update_public_profile', { xp: xpA });
  check(levelA.level === 499 && levelA.rank === 'legend', 'the server derives level and rank from XP');
  await b.rpc('update_public_profile', { xp: xpB });
  check(await rejects(a.rpc('update_public_profile', { xp: -5 })), 'negative XP is refused');
  const top = await b.rpc<{ players: RankedPlayer[]; me?: RankedPlayer }>('get_top_players', { limit: 10 });
  const ia = top.players.findIndex((p) => p.userId === a.userId);
  const ib = top.players.findIndex((p) => p.userId === b.userId);
  check(ia >= 0 && ib === ia + 1, 'more XP ranks first');
  check(top.me?.userId === b.userId && top.me.position === top.players[ib].position, 'the caller gets their own position');

  console.log('profile photos');
  check(await rejects(a.rpc('set_avatar', { image: btoa('<svg/>') })), 'non-image uploads are refused');
  const { avatarAt } = await a.rpc<{ avatarAt: number }>('set_avatar', { image: JPEG });
  check(avatarAt > 0, 'a JPEG photo is accepted');
  const listed = await b.rpc<{ players: RankedPlayer[] }>('get_top_players', { limit: 10 });
  check(listed.players.find((p) => p.userId === a.userId)?.avatarAt === avatarAt, 'rankings carry the photo timestamp');
  const photos = await b.rpc<{ avatars: Record<string, Avatar> }>('get_avatars', { userIds: [a.userId, b.userId] });
  check(photos.avatars[a.userId]?.image === JPEG && !photos.avatars[b.userId], 'other players can download the photo');
  await a.rpc('set_avatar', { image: '' });
  const after = await b.rpc<{ avatars: Record<string, Avatar> }>('get_avatars', { userIds: [a.userId] });
  check(!after.avatars[a.userId], 'removing the photo deletes it');

  console.log('player page');
  await a.rpc('submit_practice', { exercise: 'pushup', timeControl: 'bullet', reps: 25, localDate: '2026-10-10' });
  await a.rpc('submit_practice', { exercise: 'pushup', timeControl: 'blitz', reps: 40, localDate: '2026-10-10' });
  await a.rpc('submit_practice', { exercise: 'handstand', timeControl: 'resistance', reps: 30, localDate: '2026-10-10' });
  // One ranked 1v1 so the history shows a result.
  const req = (n: string) => ({ mode: 'ranked' as const, exerciseId: 'lsit', timeControlId: 'resistance' as const, player: { id: n, displayName: n } });
  const [ma, mb] = await Promise.all([
    findOnlineMatch({ token: a.token, selfUserId: a.userId, request: req('a'), baseUrl: BASE }),
    findOnlineMatch({ token: b.token, selfUserId: b.userId, request: req('b'), baseUrl: BASE }),
  ]);
  ma.match.ready();
  mb.match.ready();
  await new Promise((r) => setTimeout(r, 5500)); // countdown
  mb.match.close(); // B walks away: forfeit, A wins
  await new Promise((r) => setTimeout(r, 1500));
  ma.match.close();

  const page = await b.rpc<PlayerDetails>('get_player', { userId: a.userId, today: '2026-10-10' });
  check(page.username === a.name && page.level === 499 && page.position !== undefined, 'the page shows name, level and position');
  const pushup = page.exercises.find((e) => e.exercise === 'pushup');
  check(pushup?.today === 65 && pushup.total === 65, 'per-movement totals (65 push-ups today)');
  check(page.history.filter((h) => h.exercise === 'pushup').length === 2, 'push-up history has both sessions');
  check(page.history[0].exercise === 'lsit' && page.history[0].outcome === 'win', 'the 1v1 shows as a win, newest first');
  check(await rejects(b.rpc('get_player', { userId: crypto.randomUUID(), today: '2026-10-10' })), 'unknown players are not found');

  console.log('\nE2E players OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
