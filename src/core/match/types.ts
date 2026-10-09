import type { ExerciseId } from '../exercises/types';
import type { TimeControlId } from './timeControls';

export type ParticipantId = string;

export interface Participant {
  id: ParticipantId;
  displayName: string;
  /** True for the athlete on this device; false for a remote opponent. */
  isLocal: boolean;
}

export interface ParticipantScore {
  reps: number;
  rejectedReps: number;
  qualitySum: number;
  /** Hold competitions: longest continuous hold so far (optional: older saved results lack it). */
  holdMs?: number;
  /** Hold competitions: the hold has broken, this participant is done. */
  holdDone?: boolean;
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
}

export interface MatchState {
  config: MatchConfig;
  status: MatchStatus;
  scores: Record<ParticipantId, ParticipantScore>;
  countdownEndsAtMs: number | null;
  startedAtMs: number | null;
  endsAtMs: number | null;
  finishedAtMs: number | null;
  finishReason: 'time' | 'aborted' | null;
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
  | { type: 'abort'; nowMs: number };

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
  finishReason: 'time' | 'aborted';
  standings: ParticipantResult[];
}
