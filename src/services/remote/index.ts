import { listExercises } from '../../core/exercises/registry';
import type { MatchResult } from '../../core/match/types';
import { scoreValue } from '../../core/progress/progress';
import { localDateString, type ExerciseTotals } from '../../core/stats/repTotals';
import type {
  Avatar,
  FriendInfo,
  MatchHistoryRepository,
  PlayerDetails,
  Profile,
  ProfileService,
  RankedPlayer,
  RatingSummary,
  Services,
  SocialService,
} from '../types';
import type { SessionManager } from '../../features/auth/sessionManager';
import { findOnlineMatch, type OnlineMatch } from './onlineMatch';

interface ServerProfile {
  username: string;
  exercises: { exercise: string; today: number; month: number; total: number }[];
  ratings: Record<string, RatingSummary>;
}

/** Profile from the server; falls back to device data when the server is unreachable. */
class RemoteProfileService implements ProfileService {
  constructor(
    private readonly session: SessionManager,
    private readonly fallback: ProfileService,
  ) {}

  async getProfile(): Promise<Profile> {
    try {
      const data = await this.session.rpc<ServerProfile>('get_profile', {
        today: localDateString(new Date()),
      });
      const byId = new Map(data.exercises.map((e) => [e.exercise, e]));
      const exercises: ExerciseTotals[] = listExercises().map(({ id }) => {
        const e = byId.get(id);
        return { exerciseId: id, today: e?.today ?? 0, month: e?.month ?? 0, total: e?.total ?? 0 };
      });
      return {
        displayName: data.username,
        source: 'server',
        serverUnreachable: false,
        exercises,
        ratings: data.ratings ?? {},
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`[dawshia] get_profile failed: ${reason}`);
      const local = await this.fallback.getProfile();
      return { ...local, displayName: this.session.getSession().username, serverUnreachable: true, serverError: reason };
    }
  }
}

/** Saves locally first, then reports practice sessions to the server (best effort). */
class SyncingHistoryRepository implements MatchHistoryRepository {
  constructor(
    private readonly local: MatchHistoryRepository,
    private readonly session: SessionManager,
  ) {}

  async save(result: MatchResult): Promise<void> {
    await this.local.save(result);
    const me = result.standings.find((s) => s.participant.isLocal);
    if (result.mode !== 'practice' || !me) return;
    this.session
      .rpc('submit_practice', {
        exercise: result.exerciseId,
        timeControl: result.timeControlId,
        // Holds report whole seconds held (the server counts them the same way).
        reps: scoreValue(result),
        localDate: localDateString(new Date(result.finishedAtMs)),
      })
      .catch((e: unknown) => {
        // Offline: the session stays on the device. (A retry queue can be added later.)
        console.warn(`[dawshia] submit_practice failed: ${e instanceof Error ? e.message : e}`);
      });
  }

  get(matchId: string) {
    return this.local.get(matchId);
  }

  list() {
    return this.local.list();
  }
}

/** Friends, presence and public profile through the server. */
function remoteSocial(session: SessionManager): SocialService {
  return {
    available: true,
    async listFriends() {
      const { friends } = await session.rpc<{ friends: FriendInfo[] }>('get_friends');
      return friends ?? [];
    },
    async addFriend(username) {
      await session.rpc('add_friend', { username: username.trim() });
    },
    async removeFriend(userId) {
      await session.rpc('remove_friend', { userId });
    },
    async updatePublicProfile(profile) {
      await session.rpc('update_public_profile', profile);
    },
    async listTopPlayers() {
      const r = await session.rpc<{ players: RankedPlayer[]; me?: RankedPlayer }>('get_top_players', { limit: 50 });
      return { players: r.players ?? [], me: r.me ?? null };
    },
    async getPlayer(userId) {
      return session.rpc<PlayerDetails>('get_player', { userId, today: localDateString(new Date()) });
    },
    async setAvatar(base64) {
      await session.rpc('set_avatar', { image: base64 ?? '' });
    },
    async getAvatars(userIds) {
      if (userIds.length === 0) return {};
      const r = await session.rpc<{ avatars: Record<string, Avatar> }>('get_avatars', { userIds });
      return r.avatars ?? {};
    },
  };
}

/** Wraps the local services with the signed-in user's server-backed profile, sync and online 1v1. */
export function withRemote(local: Services, session: SessionManager): Services {
  // Online matches found by matchmaking, handed to the session as its transport.
  const onlineMatches = new Map<string, OnlineMatch>();
  return {
    ...local,
    matchmaking: {
      async findMatch(request, signal) {
        if (request.mode === 'practice') return local.matchmaking.findMatch(request, signal);
        const { match, config } = await findOnlineMatch({
          token: await session.getToken(),
          selfUserId: session.getSession().userId,
          request,
          signal,
        });
        if (signal?.aborted) {
          match.close(); // the screen was closed while the match was being set up
          throw new Error('Matchmaking cancelled');
        }
        onlineMatches.set(config.id, match);
        return config;
      },
    },
    openMatchTransport(config) {
      const online = config.online ? onlineMatches.get(config.id) : undefined;
      if (!online) return local.openMatchTransport(config);
      onlineMatches.delete(config.id);
      return online;
    },
    auth: {
      getCurrentPlayer: async () => ({
        id: session.getSession().userId,
        displayName: session.getSession().username,
      }),
    },
    history: new SyncingHistoryRepository(local.history, session),
    social: remoteSocial(session),
    profile: new RemoteProfileService(session, local.profile),
  };
}
