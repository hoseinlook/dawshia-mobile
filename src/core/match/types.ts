import type { ExerciseId } from '../exercises/types';
import type { TimeControlId } from './timeControls';

export type ParticipantId = string;

export interface Participant {
  id: ParticipantId;
  displayName: string;
  /** True for the athlete on this device; false for a remote opponent. */
  isLocal: boolean;
  /** Online: public profile shown on the VS screen. */
  profile?: { rating?: number; level?: number; rank?: string };
}

export interface ParticipantScore {
  reps: number;
  rejectedReps: number;
  qualitySum: number;
  /** Hold competitions: longest continuous hold so far (optional: older saved results lack it). */
  holdMs?: number;
  /** Game competitions: points (e.g. pipes passed). */
  points?: number;
  /** Hold/game competitions: this participant is out (hold broke / crashed). */
  done?: boolean;
}

export type MatchStatus = 'setup' | 'countdown' | 'live' | 'finished';

export type MatchMode = 'practice' | 'ranked' | 'friendly';

export interface MatchConfig {
  id: string;
  mode: MatchMode;
  exerciseId: ExerciseId;
  timeControlId: TimeControlId;
  durationMs: number;
  countdownMs: number;
  participants: Participant[];
  /** Shared random seed (game courses); the server provides it for online matches. */
  seed?: number;
  /** Online matches are run by the server: it decides when the countdown starts. */
  online?: boolean;
}

export interface MatchState {
  config: MatchConfig;
  status: MatchStatus;
  scores: Record<ParticipantId, ParticipantScore>;
  countdownEndsAtMs: number | null;
  startedAtMs: number | null;
  endsAtMs: number | null;
  finishedAtMs: number | null;
  finishReason: FinishReason | null;
}

/** time = clock ran out or everyone is out; aborted = the local player quit; forfeit = a player left an online match. */
export type FinishReason = 'time' | 'aborted' | 'forfeit';

/** Rating change reported by the server after a ranked match. */
export interface RatingChange {
  before: number;
  after: number;
}

/**
 * Everything that can happen in a match. These are plain serializable objects
 * so the same actions can later be sent to / received from the game server.
 */
export type MatchAction =
  | { type: 'startCountdown'; nowMs: number }
  | { type: 'tick'; nowMs: number }
  | { type: 'rep'; participantId: ParticipantId; quality: number; nowMs: number }
  | { type: 'repRejected'; participantId: ParticipantId; nowMs: number }
  /** Hold competitions: current hold length. */
  | { type: 'hold'; participantId: ParticipantId; holdMs: number; nowMs: number }
  /** Hold competitions: the hold broke; the participant's final hold length. */
  | { type: 'holdBroken'; participantId: ParticipantId; holdMs: number; nowMs: number }
  /** Game competitions: current points. */
  | { type: 'points'; participantId: ParticipantId; points: number; nowMs: number }
  /** Game competitions: crashed; final points. */
  | { type: 'gameOver'; participantId: ParticipantId; points: number; nowMs: number }
  | { type: 'abort'; nowMs: number }
  /** Online: the server's phase and clock (times already converted to the local clock). */
  | {
      type: 'serverPhase';
      status: MatchStatus;
      countdownEndsAtMs: number | null;
      startedAtMs: number | null;
      endsAtMs: number | null;
      finishReason?: FinishReason;
      nowMs: number;
    }
  /** Online: a participant's authoritative score from the server (absolute values). */
  | { type: 'syncScore'; participantId: ParticipantId; score: Partial<ParticipantScore>; nowMs: number };

export interface ParticipantResult {
  participant: Participant;
  score: ParticipantScore;
  averageQuality: number;
  rank: number;
}

export interface MatchResult {
  matchId: string;
  mode: MatchMode;
  exerciseId: ExerciseId;
  timeControlId: TimeControlId;
  durationMs: number;
  finishedAtMs: number;
  finishReason: FinishReason;
  standings: ParticipantResult[];
  /** Ranked matches: the local player's rating change, when the server reported it. */
  rating?: RatingChange;
}
