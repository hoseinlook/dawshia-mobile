import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { ExerciseDefinition, ExerciseEvent, FormCue } from '../../core/exercises/types';
import { computeResult, createMatchState, matchReducer } from '../../core/match/matchReducer';
import { isHold, type TimeControlId } from '../../core/match/timeControls';
import type {
  MatchAction,
  MatchConfig,
  MatchMode,
  MatchResult,
  MatchState,
} from '../../core/match/types';
import type { Pose } from '../../core/pose/types';
import { useServices } from '../../services/ServicesProvider';
import type { MatchTransport } from '../../services/types';

/** How long the athlete must hold the start position before the countdown begins. */
const READY_HOLD_MS = 1500;
const TICK_MS = 100;
/** Hold competitions: how often the current hold length is reported. */
const HOLD_REPORT_MS = 250;

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
}

const INITIAL_FEEDBACK: LiveFeedback = {
  inPosition: false,
  phase: 'unknown',
  cues: [],
  metrics: {},
  readiness: 0,
  lastEvent: null,
  combo: 0,
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
}

/**
 * Orchestrates one match on this device:
 * pose → exercise analyzer → match actions → (local reducer + transport to other players).
 */
export function useMatchSession({ exercise, timeControlId, mode }: Options) {
  const services = useServices();
  const [match, dispatch] = useReducer(sessionReducer, null);
  const [error, setError] = useState<Error | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [feedback, setFeedback] = useState<LiveFeedback>(INITIAL_FEEDBACK);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [result, setResult] = useState<MatchResult | null>(null);

  const analyzer = useMemo(() => exercise.createAnalyzer(), [exercise]);
  const transportRef = useRef<MatchTransport | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const readySinceRef = useRef<number | null>(null);
  const hold = isHold(timeControlId);
  const lastHoldMsRef = useRef(0);
  const lastHoldReportRef = useRef(0);
  useLayoutEffect(() => {
    matchRef.current = match;
  }, [match]);

  const localParticipantId = match?.config.participants.find((p) => p.isLocal)?.id ?? null;

  /** Applies a local action and broadcasts it to the other participants. */
  const act = useCallback((action: MatchAction) => {
    dispatch(action);
    transportRef.current?.publish(action);
  }, []);

  // 1. Find / create the match.
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const player = await services.auth.getCurrentPlayer();
        const config = await services.matchmaking.findMatch(
          { mode, exerciseId: exercise.id, timeControlId, player },
          abort.signal,
        );
        if (abort.signal.aborted) return;
        dispatch({ type: 'init', config });
      } catch (e) {
        if (!abort.signal.aborted) setError(e as Error);
      }
    })();
    return () => abort.abort();
  }, [services, mode, exercise.id, timeControlId]);

  // 2. Real-time channel: receive the opponents' actions.
  const matchConfig = match?.config;
  useEffect(() => {
    if (!matchConfig) return;
    const transport = services.openMatchTransport(matchConfig);
    transportRef.current = transport;
    const unsubscribe = transport.subscribe((action) => dispatch(action));
    return () => {
      unsubscribe();
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

  // Fresh analyzer state when the clock starts, so countdown movement never counts.
  useEffect(() => {
    if (status === 'live') analyzer.reset();
  }, [status, analyzer]);

  // 4. Finish: compute and store the result.
  useEffect(() => {
    if (status !== 'finished' || !matchRef.current) return;
    const final = computeResult(matchRef.current);
    setResult(final);
    services.history.save(final).catch(() => {});
  }, [status, services]);

  // 5. Every detected pose goes through the exercise analyzer.
  const onPose = useCallback(
    (nextPose: Pose | null) => {
      const now = nextPose?.timestampMs ?? Date.now();
      const update = analyzer.update(nextPose, now);
      const current = matchRef.current;
      setPose(nextPose);

      let readiness = 0;
      if (current?.status === 'setup') {
        // Holds start from standing (nobody holds a handstand through a countdown),
        // so being visible is enough; rep exercises wait for the start position.
        if (hold ? nextPose !== null : update.inPosition) {
          readySinceRef.current ??= now;
          readiness = Math.min(1, (now - readySinceRef.current) / READY_HOLD_MS);
          if (readiness >= 1) {
            readySinceRef.current = null;
            act({ type: 'startCountdown', nowMs: now });
          }
        } else {
          readySinceRef.current = null;
        }
      }

      // Hold competitions: report the current hold and when it breaks.
      if (hold && current?.status === 'live' && localParticipantId) {
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

      let lastEvent: ExerciseEvent | null = null;
      let comboChange: 'none' | 'reset' | number = 'none';
      if (current?.status === 'live' && localParticipantId) {
        for (const event of update.events) {
          lastEvent = event;
          if (event.type === 'rep') comboChange = comboChange === 'none' || comboChange === 'reset' ? 1 : comboChange + 1;
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
        combo:
          comboChange === 'none' ? prev.combo : comboChange === 'reset' ? 0 : prev.combo + comboChange,
      }));
    },
    [analyzer, act, localParticipantId, hold],
  );

  const abort = useCallback(() => act({ type: 'abort', nowMs: Date.now() }), [act]);

  return { match, error, pose, feedback, nowMs, result, onPose, abort, localParticipantId };
}
