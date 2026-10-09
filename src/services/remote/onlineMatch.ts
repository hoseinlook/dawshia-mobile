import { getTimeControl, type TimeControlId } from '../../core/match/timeControls';
import type { FinishReason, MatchAction, MatchConfig, MatchStatus, ParticipantScore } from '../../core/match/types';
import type { LiveEvent, MatchRequest, MatchTransport, ServerResult } from '../types';
import { fromBase64, NakamaSocket, toBase64 } from './nakamaSocket';

/** Op codes — must match dawshia-server/internal/match/protocol.go. */
export const Op = {
  State: 1,
  Rep: 2,
  RepRejected: 3,
  Score: 4,
  Finished: 5,
  Ready: 6,
  Progress: 7,
  Bird: 8,
  Chat: 9,
} as const;

interface ServerPlayer {
  userId: string;
  username: string;
  reps: number;
  rejected: number;
  ready: boolean;
  value: number;
  done: boolean;
  rating?: number;
  level?: number;
  rank?: string;
}

interface ServerState {
  phase: 'waiting' | 'countdown' | 'live' | 'finished';
  exercise: string;
  timeControl: string;
  format: string;
  seed: number;
  serverTime: number;
  countdownEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  players: ServerPlayer[];
}

interface ServerFinished {
  matchId: string;
  reason: 'time' | 'forfeit' | 'cancelled';
  standings: { userId: string; ratingBefore?: number; ratingAfter?: number }[];
}

const SERVER_COUNTDOWN_MS = 5000;

const REASONS: Record<ServerFinished['reason'], FinishReason> = {
  time: 'time',
  forfeit: 'forfeit',
  cancelled: 'aborted',
};

const PHASES: Record<ServerState['phase'], MatchStatus> = {
  waiting: 'setup',
  countdown: 'countdown',
  live: 'live',
  finished: 'finished',
};

/** A player's server score in the app's units (reps / hold ms / points). */
function toScore(timeControlId: string, p: { reps: number; rejected: number; value: number; done: boolean }): Partial<ParticipantScore> {
  const format = getTimeControl(timeControlId).format;
  return {
    reps: p.reps,
    rejectedReps: p.rejected,
    done: p.done,
    ...(format === 'maxHold' ? { holdMs: p.value } : format === 'game' ? { points: p.value } : {}),
  };
}

/**
 * One online match over a Nakama socket. Created by `findOnlineMatch`, then
 * used as the session's `MatchTransport`.
 */
export class OnlineMatch implements MatchTransport {
  private readonly actionListeners = new Set<(a: MatchAction) => void>();
  private readonly liveListeners = new Set<(e: LiveEvent) => void>();
  private readonly resultListeners = new Set<(r: ServerResult) => void>();
  /** Local clock − server clock. */
  private clockOffset = 0;
  private lastState: ServerState | null = null;
  private finished = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly socket: NakamaSocket,
    readonly matchId: string,
    readonly selfUserId: string,
    readonly timeControlId: TimeControlId,
  ) {
    const offData = socket.on('match_data', (d: { match_id: string; op_code: string | number; data?: string }) => {
      if (d.match_id !== this.matchId) return;
      this.onData(Number(d.op_code), d.data ? JSON.parse(fromBase64(d.data)) : {});
    });
    const offDisconnect = socket.on('disconnect', () => {
      if (!this.finished) this.emitAction({ type: 'serverPhase', status: 'finished', countdownEndsAtMs: null, startedAtMs: null, endsAtMs: null, finishReason: 'aborted', nowMs: Date.now() });
    });
    this.unsubscribe = () => {
      offData();
      offDisconnect();
    };
  }

  /** Waits for the first server state that lists every player. */
  waitForPlayers(count: number, timeoutMs = 10_000): Promise<ServerState> {
    return new Promise((resolve, reject) => {
      const check = () => this.lastState && this.lastState.players.length >= count;
      if (check()) return resolve(this.lastState!);
      const timer = setTimeout(() => {
        off();
        reject(new Error('Opponent did not join'));
      }, timeoutMs);
      const off = this.socket.on('match_data', () => {
        if (check()) {
          clearTimeout(timer);
          off();
          resolve(this.lastState!);
        }
      });
    });
  }

  toConfig(mode: MatchRequest['mode']): MatchConfig {
    const state = this.lastState!;
    const tc = getTimeControl(state.timeControl);
    return {
      id: this.matchId,
      mode,
      exerciseId: state.exercise,
      timeControlId: tc.id,
      durationMs: tc.durationSec * 1000,
      countdownMs: SERVER_COUNTDOWN_MS,
      participants: state.players.map((p) => ({
        id: p.userId,
        displayName: p.username,
        isLocal: p.userId === this.selfUserId,
        profile: { rating: p.rating, level: p.level, rank: p.rank },
      })),
      seed: state.seed,
      online: true,
    };
  }

  // --- MatchTransport ---------------------------------------------------------

  publish(action: MatchAction): void {
    switch (action.type) {
      case 'rep':
        return this.sendOp(Op.Rep, { quality: action.quality });
      case 'repRejected':
        return this.sendOp(Op.RepRejected, {});
      case 'hold':
      case 'holdBroken':
        return this.sendOp(Op.Progress, { value: Math.round(action.holdMs), done: action.type === 'holdBroken' });
      case 'points':
      case 'gameOver':
        return this.sendOp(Op.Progress, { value: action.points, done: action.type === 'gameOver' });
      case 'abort':
        this.finished = true;
        this.socket.send({ match_leave: { match_id: this.matchId } });
        return;
      default:
        // Phases and clocks are decided by the server.
        return;
    }
  }

  ready(): void {
    this.sendOp(Op.Ready, {});
  }

  sendLive(event: LiveEvent): void {
    if (event.type === 'bird') this.sendOp(Op.Bird, { y: Math.round(event.y * 1000) / 1000 }, false);
    if (event.type === 'chat') this.sendOp(Op.Chat, { code: event.code });
  }

  subscribe(listener: (action: MatchAction) => void): () => void {
    this.actionListeners.add(listener);
    if (this.lastState) this.applyState(this.lastState, [listener]); // catch up on the current state
    return () => this.actionListeners.delete(listener);
  }

  subscribeLive(listener: (event: LiveEvent) => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  subscribeResult(listener: (result: ServerResult) => void): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  close(): void {
    if (!this.finished) this.socket.send({ match_leave: { match_id: this.matchId } });
    this.unsubscribe();
    this.socket.close();
  }

  // --- incoming ----------------------------------------------------------------

  private sendOp(op: number, payload: unknown, reliable = true): void {
    this.socket.send({
      match_data_send: { match_id: this.matchId, op_code: String(op), data: toBase64(JSON.stringify(payload)), reliable },
    });
  }

  private onData(op: number, payload: any): void {
    const now = Date.now();
    switch (op) {
      case Op.State: {
        const state = payload as ServerState;
        this.clockOffset = now - state.serverTime;
        this.lastState = state;
        this.applyState(state, [...this.actionListeners]);
        break;
      }
      case Op.Score: {
        const p = payload as ServerPlayer;
        if (p.userId === this.selfUserId) break; // our own score is counted locally
        this.emitAction({ type: 'syncScore', participantId: p.userId, score: toScore(this.timeControlId, p), nowMs: now });
        break;
      }
      case Op.Chat: {
        const c = payload as { userId: string; code: string };
        if (c.userId !== this.selfUserId) for (const l of this.liveListeners) l({ type: 'chat', participantId: c.userId, code: c.code });
        break;
      }
      case Op.Bird: {
        const b = payload as { userId: string; y: number };
        if (b.userId !== this.selfUserId) for (const l of this.liveListeners) l({ type: 'bird', participantId: b.userId, y: b.y });
        break;
      }
      case Op.Finished: {
        const f = payload as ServerFinished;
        this.finished = true;
        const ratings: ServerResult['ratings'] = {};
        for (const s of f.standings) {
          if (s.ratingBefore !== undefined && s.ratingAfter !== undefined) {
            ratings[s.userId] = { before: Math.round(s.ratingBefore), after: Math.round(s.ratingAfter) };
          }
        }
        for (const l of this.resultListeners) l({ reason: REASONS[f.reason], ratings });
        this.emitAction({ type: 'serverPhase', status: 'finished', countdownEndsAtMs: null, startedAtMs: null, endsAtMs: null, finishReason: REASONS[f.reason], nowMs: now });
        break;
      }
    }
  }

  private applyState(state: ServerState, listeners: ((a: MatchAction) => void)[]): void {
    const local = (t?: number) => (t ? t + this.clockOffset : null);
    const now = Date.now();
    const actions: MatchAction[] = [];
    // Opponents' scores first, then the phase (so a finished phase sees final scores).
    for (const p of state.players) {
      if (p.userId !== this.selfUserId) {
        actions.push({ type: 'syncScore', participantId: p.userId, score: toScore(this.timeControlId, p), nowMs: now });
      }
    }
    // "finished" is announced by OpFinished (with the reason and ratings).
    if (state.phase !== 'finished') {
      actions.push({
        type: 'serverPhase',
        status: PHASES[state.phase],
        countdownEndsAtMs: local(state.countdownEndsAt),
        startedAtMs: local(state.startedAt),
        endsAtMs: local(state.endsAt),
        nowMs: now,
      });
    }
    for (const a of actions) for (const l of listeners) l(a);
  }

  private emitAction(action: MatchAction): void {
    for (const l of this.actionListeners) l(action);
  }
}

/**
 * Ranked matchmaking: queue for the same exercise + competition, join the
 * match the server creates, and wait until both players are in.
 */
export async function findOnlineMatch(params: {
  token: string;
  selfUserId: string;
  request: MatchRequest;
  signal?: AbortSignal;
  baseUrl?: string;
}): Promise<{ match: OnlineMatch; config: MatchConfig }> {
  const { token, selfUserId, request, signal } = params;
  const socket = new NakamaSocket(params.baseUrl);
  await socket.connect(token);

  const abortError = () => new Error('Matchmaking cancelled');
  if (signal?.aborted) {
    socket.close();
    throw abortError();
  }

  const matched = new Promise<{ match_id: string }>((resolve) => {
    socket.on('matchmaker_matched', (m: { match_id: string }) => resolve(m));
  });
  const ticketReply = await socket.request({
    matchmaker_add: {
      min_count: 2,
      max_count: 2,
      query: `+properties.exercise:${request.exerciseId} +properties.timeControl:${request.timeControlId}`,
      string_properties: { exercise: request.exerciseId, timeControl: request.timeControlId },
      numeric_properties: {},
    },
  });
  const ticket = (ticketReply.matchmaker_ticket as { ticket: string }).ticket;

  const cancelled = new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () => {
      socket.send({ matchmaker_remove: { ticket } });
      socket.close();
      reject(abortError());
    });
  });

  const { match_id: matchId } = await Promise.race([matched, cancelled]);
  const match = new OnlineMatch(socket, matchId, selfUserId, request.timeControlId);
  await socket.request({ match_join: { match_id: matchId } });
  await Promise.race([match.waitForPlayers(2), cancelled]);
  return { match, config: match.toConfig(request.mode) };
}
