import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { ExerciseDefinition, ExerciseEvent, FormCue } from '../../core/exercises/types';
import { FlappyGame, type FlappyState } from '../../core/games/flappy';
import { computeResult, createMatchState, matchReducer } from '../../core/match/matchReducer';
import { isGame, isHold, type TimeControlId } from '../../core/match/timeControls';
import type { MatchAction, MatchConfig, MatchMode, MatchResult, MatchState } from '../../core/match/types';
import type { Pose } from '../../core/pose/types';
import { useServices } from '../../services/ServicesProvider';
import type { ChallengeMatch, MatchTransport, ServerResult } from '../../services/types';

/** How long the athlete must hold the start position before the countdown begins. */
const READY_HOLD_MS = 1500;
const TICK_MS = 100;
/** Hold competitions: how often the current hold length is reported. */
const HOLD_REPORT_MS = 250;
/** Game competitions: how often the bird position is sent to the opponent. */
const BIRD_REPORT_MS = 100;
/** Online: how long to wait for the server's final result (ratings) after the match ends. */
const SERVER_RESULT_WAIT_MS = 4000;
/** Quick chat: minimum gap between own messages (the server enforces the same). */
const CHAT_COOLDOWN_MS = 1500;

/** Preset quick-chat phrases (translated on each phone; no free text to moderate). */
export const CHAT_CODES = ['goodLuck', 'letsGo', 'niceOne', 'wow', 'tooEasy', 'almostThere', 'ouch', 'gg'] as const;
export type ChatCode = (typeof CHAT_CODES)[number];

export interface ChatBubble {
  code: ChatCode;
  atMs: number;
}

export interface LiveFeedback {
  inPosition: boolean;
  phase: string;
  cues: FormCue[];
  metrics: Record<string, number>;
  /** 0..1 progress of holding the start position during setup. */
  readiness: number;
  lastEvent: ExerciseEvent | null;
  /** Valid reps in a row since the last rejected rep (instant-feedback combo). */
  combo: number;
  /** Online: this athlete is ready, waiting for the opponent. */
  waitingForOpponent: boolean;
  /** Game competitions: points and crash state. */
  game: FlappyState | null;
}

const INITIAL_FEEDBACK: LiveFeedback = {
  inPosition: false,
  phase: 'unknown',
  cues: [],
  metrics: {},
  readiness: 0,
  lastEvent: null,
  combo: 0,
  waitingForOpponent: false,
  game: null,
};

type SessionAction = MatchAction | { type: 'init'; config: MatchConfig };

function sessionReducer(state: MatchState | null, action: SessionAction): MatchState | null {
  if (action.type === 'init') return createMatchState(action.config);
  return state ? matchReducer(state, action) : state;
}

interface Options {
  exercise: ExerciseDefinition;
  timeControlId: TimeControlId;
  mode: MatchMode;
  /** Friend challenge: join this private match. */
  challenge?: ChallengeMatch;
}

/**
 * Orchestrates one match on this device:
 * pose → exercise analyzer → match actions → (local reducer + transport to the server).
 *
 * Offline (practice) the local reducer runs everything. Online, the server is in
 * charge: the countdown starts when every player is ready, phases and scores
 * arrive as `serverPhase` / `syncScore`, and the final result carries ratings.
 */
export function useMatchSession({ exercise, timeControlId, mode, challenge }: Options) {
  const services = useServices();
  const [match, dispatch] = useReducer(sessionReducer, null);
  const [error, setError] = useState<Error | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [feedback, setFeedback] = useState<LiveFeedback>(INITIAL_FEEDBACK);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [result, setResult] = useState<MatchResult | null>(null);
  /** Online, ghost birds of the other players: participantId → height. */
  const [opponentBirds, setOpponentBirds] = useState<Record<string, number>>({});
  /** Online, the latest quick-chat phrase of each participant. */
  const [chat, setChat] = useState<Record<string, ChatBubble>>({});
  const lastChatSentRef = useRef(0);

  const analyzer = useMemo(() => exercise.createAnalyzer(), [exercise]);
  const transportRef = useRef<MatchTransport | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const readySinceRef = useRef<number | null>(null);
  const sentReadyRef = useRef(false);
  const serverResultRef = useRef<ServerResult | null>(null);
  const hold = isHold(timeControlId);
  const game = isGame(timeControlId);
  const lastHoldMsRef = useRef(0);
  const lastHoldReportRef = useRef(0);
  const gameRef = useRef<FlappyGame | null>(null);
  const lastBirdReportRef = useRef(0);
  useLayoutEffect(() => {
    matchRef.current = match;
  }, [match]);

  const localParticipantId = match?.config.participants.find((p) => p.isLocal)?.id ?? null;
  const online = !!match?.config.online;

  /** Applies a local action and sends it to the server (online). */
  const act = useCallback((action: MatchAction) => {
    dispatch(action);
    transportRef.current?.publish(action);
  }, []);

  // 1. Find / create the match (online: matchmaking until an opponent is found).
  const challengeMatchId = challenge?.matchId;
  const challengeExpiresAt = challenge?.expiresAt;
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const player = await services.auth.getCurrentPlayer();
        const config = await services.matchmaking.findMatch(
          {
            mode,
            exerciseId: exercise.id,
            timeControlId,
            player,
            challenge: challengeMatchId ? { matchId: challengeMatchId, expiresAt: challengeExpiresAt ?? 0 } : undefined,
          },
          abort.signal,
        );
        if (abort.signal.aborted) return;
        dispatch({ type: 'init', config });
      } catch (e) {
        if (!abort.signal.aborted) setError(e as Error);
      }
    })();
    return () => abort.abort();
  }, [services, mode, exercise.id, timeControlId, challengeMatchId, challengeExpiresAt]);

  // 2. Real-time channel: server state, opponents' scores and ghost birds.
  const matchConfig = match?.config;
  useEffect(() => {
    if (!matchConfig) return;
    const transport = services.openMatchTransport(matchConfig);
    transportRef.current = transport;
    const unsubscribers = [
      transport.subscribe((action) => dispatch(action)),
      transport.subscribeLive((event) => {
        if (event.type === 'bird') setOpponentBirds((prev) => ({ ...prev, [event.participantId]: event.y }));
        if (event.type === 'chat' && (CHAT_CODES as readonly string[]).includes(event.code)) {
          setChat((prev) => ({ ...prev, [event.participantId]: { code: event.code as ChatCode, atMs: Date.now() } }));
        }
      }),
      transport.subscribeResult((r) => {
        serverResultRef.current = r;
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      transport.close();
      transportRef.current = null;
    };
  }, [services, matchConfig]);

  // 3. Clock.
  const status = match?.status;
  useEffect(() => {
    if (status !== 'countdown' && status !== 'live') return;
    const id = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      dispatch({ type: 'tick', nowMs: now });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status]);

  // Fresh analyzer (and game) state when the clock starts, so countdown movement never counts.
  const seed = match?.config.seed ?? 0;
  useEffect(() => {
    if (status !== 'live') return;
    analyzer.reset();
    if (game) gameRef.current = new FlappyGame(seed);
  }, [status, analyzer, game, seed]);

  // 4. Finish: compute and store the result (online: with the server's ratings when they arrive).
  useEffect(() => {
    if (status !== 'finished' || !matchRef.current) return;
    let done = false;
    const finish = () => {
      if (done || !matchRef.current) return;
      done = true;
      const final = computeResult(matchRef.current);
      const server = serverResultRef.current;
      if (server && localParticipantId && server.ratings[localParticipantId]) {
        final.rating = server.ratings[localParticipantId];
      }
      if (server?.reason === 'forfeit') final.finishReason = 'forfeit';
      setResult(final);
      services.history.save(final).catch(() => {});
    };
    if (!online || serverResultRef.current) {
      finish();
      return;
    }
    const startedWaiting = Date.now();
    const poll = setInterval(() => {
      if (serverResultRef.current || Date.now() - startedWaiting > SERVER_RESULT_WAIT_MS) finish();
      if (done) clearInterval(poll);
    }, 100);
    return () => clearInterval(poll);
  }, [status, services, online, localParticipantId]);

  // 5. Every detected pose goes through the exercise analyzer.
  const onPose = useCallback(
    (nextPose: Pose | null) => {
      const now = nextPose?.timestampMs ?? Date.now();
      const update = analyzer.update(nextPose, now);
      const current = matchRef.current;
      setPose(nextPose);

      // Ready check: holds start from standing (being visible is enough);
      // reps and games wait for the start position.
      let readiness = 0;
      let waitingForOpponent = false;
      if (current?.status === 'setup') {
        if (sentReadyRef.current) {
          waitingForOpponent = true;
          readiness = 1;
        } else if (hold ? nextPose !== null : update.inPosition) {
          readySinceRef.current ??= now;
          readiness = Math.min(1, (now - readySinceRef.current) / READY_HOLD_MS);
          if (readiness >= 1) {
            readySinceRef.current = null;
            if (current.config.online) {
              sentReadyRef.current = true;
              transportRef.current?.ready();
            } else {
              act({ type: 'startCountdown', nowMs: now });
            }
          }
        } else {
          readySinceRef.current = null;
        }
      }

      const live = current?.status === 'live' && localParticipantId;

      // Hold competitions: report the current hold and when it breaks.
      if (hold && live) {
        const holdMs = update.metrics.holdMs;
        if (update.inPosition && holdMs !== undefined) {
          lastHoldMsRef.current = holdMs;
          if (now - lastHoldReportRef.current >= HOLD_REPORT_MS) {
            lastHoldReportRef.current = now;
            act({ type: 'hold', participantId: localParticipantId, holdMs, nowMs: now });
          }
        } else if (lastHoldMsRef.current > 0) {
          act({ type: 'holdBroken', participantId: localParticipantId, holdMs: lastHoldMsRef.current, nowMs: now });
          lastHoldMsRef.current = 0;
        }
      }

      // Game competitions: fly the bird, score pipes, detect the crash.
      let gameState: FlappyState | null = gameRef.current?.current ?? null;
      if (game && live && gameRef.current && current.startedAtMs !== null) {
        const before = gameRef.current.current;
        const birdY = update.metrics.birdY ?? 0.5;
        gameState = gameRef.current.step(now - current.startedAtMs, birdY, update.inPosition);
        if (gameState.crashed && !before.crashed) {
          act({ type: 'gameOver', participantId: localParticipantId, points: gameState.points, nowMs: now });
        } else if (gameState.points > before.points) {
          act({ type: 'points', participantId: localParticipantId, points: gameState.points, nowMs: now });
        }
        if (current.config.online && !gameState.crashed && now - lastBirdReportRef.current >= BIRD_REPORT_MS) {
          lastBirdReportRef.current = now;
          transportRef.current?.sendLive({ type: 'bird', participantId: localParticipantId, y: birdY });
        }
      }

      let lastEvent: ExerciseEvent | null = null;
      let comboChange: 'none' | 'reset' | number = 'none';
      if (live) {
        for (const event of update.events) {
          lastEvent = event;
          if (event.type === 'rep')
            comboChange = comboChange === 'none' || comboChange === 'reset' ? 1 : comboChange + 1;
          else comboChange = 'reset';
          act(
            event.type === 'rep'
              ? { type: 'rep', participantId: localParticipantId, quality: event.quality, nowMs: now }
              : { type: 'repRejected', participantId: localParticipantId, nowMs: now },
          );
        }
      }

      setFeedback((prev) => ({
        inPosition: update.inPosition,
        phase: update.phase,
        cues: update.cues,
        metrics: update.metrics,
        readiness,
        lastEvent: lastEvent ?? prev.lastEvent,
        combo: comboChange === 'none' ? prev.combo : comboChange === 'reset' ? 0 : prev.combo + comboChange,
        waitingForOpponent,
        game: gameState,
      }));
    },
    [analyzer, act, localParticipantId, hold, game],
  );

  const abort = useCallback(() => act({ type: 'abort', nowMs: Date.now() }), [act]);

  /** Sends a quick-chat phrase to the opponent. Returns false while on cooldown. */
  const sendChat = useCallback(
    (code: ChatCode): boolean => {
      const now = Date.now();
      if (!localParticipantId || !transportRef.current || now - lastChatSentRef.current < CHAT_COOLDOWN_MS)
        return false;
      lastChatSentRef.current = now;
      transportRef.current.sendLive({ type: 'chat', participantId: localParticipantId, code });
      setChat((prev) => ({ ...prev, [localParticipantId]: { code, atMs: now } }));
      return true;
    },
    [localParticipantId],
  );

  return {
    match,
    error,
    pose,
    feedback,
    nowMs,
    result,
    onPose,
    abort,
    localParticipantId,
    online,
    opponentBirds,
    chat,
    sendChat,
  };
}
