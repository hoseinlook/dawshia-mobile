import type { ExerciseId } from '../core/exercises/types';
import type { TimeControlId } from '../core/match/timeControls';
import type { FinishReason, MatchAction, MatchConfig, MatchMode, MatchResult, RatingChange } from '../core/match/types';
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
  /** Friend challenge: join this private match instead of matchmaking. */
  challenge?: ChallengeMatch;
}

/** A friend challenge's private match, as the challenger or the challenged friend. */
export interface ChallengeMatch {
  matchId: string;
  /** After this (epoch ms) the challenge can no longer be accepted. */
  expiresAt: number;
}

/** A friend challenged you to a 1v1 (arrives while the app is open). */
export interface ChallengeInvite extends ChallengeMatch {
  exerciseId: ExerciseId;
  timeControlId: TimeControlId;
  /** The challenger. */
  userId: string;
  username: string;
}

/** Why a friend challenge did not start. */
export class ChallengeError extends Error {
  constructor(
    readonly reason: 'declined' | 'noAnswer' | 'expired',
    message = `Challenge ${reason}`,
  ) {
    super(message);
    this.name = 'ChallengeError';
  }
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
  lastActivity?: Activity;
  /** When the profile photo last changed (absent = no photo). */
  avatarAt?: number;
}

/** One finished practice or match, as other players see it. */
export interface Activity {
  exercise: string;
  timeControl: string;
  mode: string;
  /** Score in the competition's unit: reps, seconds held or pipes. */
  score: number;
  at: number;
  /** 1v1 only. */
  outcome?: 'win' | 'loss' | 'draw';
}

/** A player in the level ranking. */
export interface RankedPlayer {
  userId: string;
  username: string;
  level: number;
  rank: string;
  xp: number;
  online: boolean;
  avatarAt?: number;
  /** 1 = top; absent when not ranked yet. */
  position?: number;
}

/** A player's page: per-movement totals, ratings and recent sessions. */
export interface PlayerDetails extends RankedPlayer {
  exercises: { exercise: string; today: number; month: number; total: number }[];
  ratings: Record<string, RatingSummary>;
  /** Newest first. */
  history: Activity[];
  /** You played a 1v1 with them, so you can message each other. */
  canChat?: boolean;
}

/** A past 1v1 opponent you can message. */
export interface ChatPartner {
  userId: string;
  username: string;
  online: boolean;
  level?: number;
  rank?: string;
  avatarAt?: number;
  lastPlayedAt: number;
  /** Newest message of the conversation, if any. */
  lastMessage?: ChatPreview;
}

/** The newest message of a conversation, for the chat list. */
export interface ChatPreview {
  senderId: string;
  text: string;
  /** Epoch ms. */
  at: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  username: string;
  text: string;
  /** Epoch ms. */
  at: number;
}

/** An open direct chat with one player. */
export interface ChatConversation {
  /** The latest messages when the chat opened, newest first. */
  readonly history: ChatMessage[];
  /** Older messages before the ones already loaded (newest first); empty when there are no more. */
  loadOlder(): Promise<ChatMessage[]>;
  send(text: string): Promise<void>;
  /** New messages, including your own once the server accepted them. */
  subscribe(listener: (message: ChatMessage) => void): () => void;
  /** The connection dropped; open the chat again to continue. */
  onDisconnect(listener: () => void): () => void;
  close(): void;
}

/** Longest chat message, in characters (the server enforces it too). */
export const MAX_CHAT_LENGTH = 500;

export interface Avatar {
  /** Base64 JPEG/PNG. */
  image: string;
  updatedAt: number;
}

export interface SocialService {
  /** False offline: friends need an account. */
  readonly available: boolean;
  listFriends(): Promise<FriendInfo[]>;
  /** Sends a request, or accepts one if that player already asked. */
  addFriend(username: string): Promise<void>;
  /** Removes a friend, cancels a sent request or declines a received one. */
  removeFriend(userId: string): Promise<void>;
  /** Publishes total XP (the server derives level and rank) for friends, opponents and rankings. */
  updatePublicProfile(profile: { xp: number }): Promise<void>;
  /** Top players by level, plus the caller's own position. */
  listTopPlayers(): Promise<{ players: RankedPlayer[]; me: RankedPlayer | null }>;
  getPlayer(userId: string): Promise<PlayerDetails>;
  /** Uploads (or with null removes) the caller's profile photo. */
  setAvatar(base64: string | null): Promise<void>;
  getAvatars(userIds: string[]): Promise<Record<string, Avatar>>;
  /** Challenges an online friend to a 1v1 in a private match; join it with `MatchRequest.challenge`. */
  challengeFriend(userId: string, exerciseId: ExerciseId, timeControlId: TimeControlId): Promise<ChallengeMatch>;
  /** Tells the challenger you said no. */
  declineChallenge(invite: ChallengeInvite): Promise<void>;
  /** Players you played a 1v1 with, most recent first. */
  listChatPartners(): Promise<ChatPartner[]>;
  /** Opens the direct chat with a past 1v1 opponent. */
  openChat(userId: string): Promise<ChatConversation>;
}

export interface Services {
  auth: AuthService;
  matchmaking: MatchmakingService;
  history: MatchHistoryRepository;
  profile: ProfileService;
  social: SocialService;
  openMatchTransport(match: MatchConfig): MatchTransport;
}
