import { listExercises } from '../../core/exercises/registry';
import type { MatchResult } from '../../core/match/types';
import { localDateString, type ExerciseTotals } from '../../core/stats/repTotals';
import type {
  MatchHistoryRepository,
  Profile,
  ProfileService,
  RatingSummary,
  Services,
} from '../types';
import type { SessionManager } from '../../features/auth/sessionManager';

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
        reps: me.score.reps,
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

/** Wraps the local services with the signed-in user's server-backed profile and sync. */
export function withRemote(local: Services, session: SessionManager): Services {
  return {
    ...local,
    auth: {
      getCurrentPlayer: async () => ({
        id: session.getSession().userId,
        displayName: session.getSession().username,
      }),
    },
    history: new SyncingHistoryRepository(local.history, session),
    profile: new RemoteProfileService(session, local.profile),
  };
}
