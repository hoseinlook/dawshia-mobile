import type { ExerciseId } from '../core/exercises/types';
import type { TimeControlId } from '../core/match/timeControls';
import type {
  FinishReason,
  MatchAction,
  MatchConfig,
  MatchMode,
  MatchResult,
  RatingChange,
} from '../core/match/types';
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

/** Ephemeral live data between players (not part of the score). */
export type LiveEvent =
  /** Flappy bird height 0 (top) … 1 (bottom), for the opponent's ghost. */
  | { type: 'bird'; participantId: string; y: number }
  /** Quick-chat phrase (a code translated on each phone, see `chat` in the i18n messages). */
  | { type: 'chat'; participantId: string; code: string };

/** The server's final word on an online match. */
export interface ServerResult {
  reason: FinishReason;
  /** Rating change per participant (ranked matches). */
  ratings: Record<string, RatingChange>;
}

/**
 * Real-time channel for one match. Local scoring actions are published;
 * the server's authoritative state arrives through `subscribe`.
 */
export interface MatchTransport {
  publish(action: MatchAction): void;
  /** Online: the athlete is in the start position (the server starts the countdown when everyone is). */
  ready(): void;
  sendLive(event: LiveEvent): void;
  subscribe(listener: (action: MatchAction) => void): () => void;
  subscribeLive(listener: (event: LiveEvent) => void): () => void;
  subscribeResult(listener: (result: ServerResult) => void): () => void;
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

/** A friend or friend request, with presence and latest activity. */
export interface FriendInfo {
  userId: string;
  username: string;
  online: boolean;
  /** friend = mutual; incoming = they asked you; outgoing = you asked them. */
  state: 'friend' | 'incoming' | 'outgoing';
  level?: number;
  rank?: string;
  lastActivity?: { exercise: string; timeControl: string; mode: string; score: number; at: number };
}

export interface SocialService {
  /** False offline: friends need an account. */
  readonly available: boolean;
  listFriends(): Promise<FriendInfo[]>;
  /** Sends a request, or accepts one if that player already asked. */
  addFriend(username: string): Promise<void>;
  /** Removes a friend, cancels a sent request or declines a received one. */
  removeFriend(userId: string): Promise<void>;
  /** Publishes level and rank so friends and opponents can see them. */
  updatePublicProfile(profile: { level: number; rank: string }): Promise<void>;
}

export interface Services {
  auth: AuthService;
  matchmaking: MatchmakingService;
  history: MatchHistoryRepository;
  profile: ProfileService;
  social: SocialService;
  openMatchTransport(match: MatchConfig): MatchTransport;
}
