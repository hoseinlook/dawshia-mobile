import type { ExerciseId } from '../core/exercises/types';
import type { TimeControlId } from '../core/match/timeControls';
import type { MatchAction, MatchConfig, MatchMode, MatchResult } from '../core/match/types';
import type { ExerciseTotals } from '../core/stats/repTotals';

/**
 * Backend boundary.
 *
 * The UI only talks to these interfaces. Today they are implemented locally
 * (`services/local`); later a `services/remote` implementation backed by the
 * Dawshia server (Nakama) can be swapped in without touching screens or core logic.
 */

export interface PlayerProfile {
  id: string;
  displayName: string;
}

export interface AuthService {
  getCurrentPlayer(): Promise<PlayerProfile>;
}

export interface MatchRequest {
  mode: MatchMode;
  exerciseId: ExerciseId;
  timeControlId: TimeControlId;
  player: PlayerProfile;
}

export interface MatchmakingService {
  /** Resolves when a match is ready (immediately for practice, after pairing for ranked). */
  findMatch(request: MatchRequest, signal?: AbortSignal): Promise<MatchConfig>;
}

/**
 * Real-time channel for one match. Local actions are published; actions from
 * other participants arrive through `subscribe`.
 */
export interface MatchTransport {
  publish(action: MatchAction): void;
  subscribe(listener: (action: MatchAction) => void): () => void;
  close(): void;
}

export interface MatchHistoryRepository {
  save(result: MatchResult): Promise<void>;
  get(matchId: string): Promise<MatchResult | undefined>;
  list(): Promise<MatchResult[]>;
}

export interface RatingSummary {
  rating: number;
  provisional: boolean;
  games: number;
}

export interface Profile {
  /** Server username, or null when only device data is available. */
  displayName: string | null;
  /** Where the numbers came from. */
  source: 'server' | 'device';
  /** True when signed in but the server could not be reached. */
  serverUnreachable: boolean;
  /** Technical reason for the failure, shown to help debugging. */
  serverError?: string;
  /** One entry per registered exercise, in registry order. */
  exercises: ExerciseTotals[];
  /** Ranked ratings keyed like "pushup.bullet" (only competitions with games). */
  ratings: Record<string, RatingSummary>;
}

export interface ProfileService {
  getProfile(): Promise<Profile>;
}

export interface Services {
  auth: AuthService;
  matchmaking: MatchmakingService;
  history: MatchHistoryRepository;
  profile: ProfileService;
  openMatchTransport(match: MatchConfig): MatchTransport;
}
