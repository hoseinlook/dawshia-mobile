import type {
  MatchAction,
  MatchConfig,
  MatchResult,
  MatchState,
  ParticipantResult,
  ParticipantScore,
} from './types';

const EMPTY_SCORE: ParticipantScore = { reps: 0, rejectedReps: 0, qualitySum: 0 };

export function createMatchState(config: MatchConfig): MatchState {
  const scores: MatchState['scores'] = {};
  for (const p of config.participants) scores[p.id] = { ...EMPTY_SCORE };
  return {
    config,
    status: 'setup',
    scores,
    countdownEndsAtMs: null,
    startedAtMs: null,
    endsAtMs: null,
    finishedAtMs: null,
    finishReason: null,
  };
}

/**
 * Pure match state machine: setup → countdown → live → finished.
 * Runs identically on every client (and later on the server for validation).
 */
export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'startCountdown': {
      if (state.status !== 'setup') return state;
      return {
        ...state,
        status: 'countdown',
        countdownEndsAtMs: action.nowMs + state.config.countdownMs,
      };
    }

    case 'tick': {
      if (state.status === 'countdown' && state.countdownEndsAtMs !== null) {
        if (action.nowMs < state.countdownEndsAtMs) return state;
        const startedAtMs = state.countdownEndsAtMs;
        return {
          ...state,
          status: 'live',
          startedAtMs,
          endsAtMs: startedAtMs + state.config.durationMs,
        };
      }
      if (state.status === 'live' && state.endsAtMs !== null && action.nowMs >= state.endsAtMs) {
        return { ...state, status: 'finished', finishedAtMs: state.endsAtMs, finishReason: 'time' };
      }
      return state;
    }

    case 'rep': {
      if (!isScoring(state, action.nowMs)) return state;
      const prev = state.scores[action.participantId];
      if (!prev) return state;
      return {
        ...state,
        scores: {
          ...state.scores,
          [action.participantId]: {
            ...prev,
            reps: prev.reps + 1,
            qualitySum: prev.qualitySum + action.quality,
          },
        },
      };
    }

    case 'repRejected': {
      if (!isScoring(state, action.nowMs)) return state;
      const prev = state.scores[action.participantId];
      if (!prev) return state;
      return {
        ...state,
        scores: {
          ...state.scores,
          [action.participantId]: { ...prev, rejectedReps: prev.rejectedReps + 1 },
        },
      };
    }

    case 'abort': {
      if (state.status === 'finished') return state;
      return { ...state, status: 'finished', finishedAtMs: action.nowMs, finishReason: 'aborted' };
    }
  }
}

function isScoring(state: MatchState, nowMs: number): boolean {
  return state.status === 'live' && state.endsAtMs !== null && nowMs < state.endsAtMs;
}

export function remainingMs(state: MatchState, nowMs: number): number {
  switch (state.status) {
    case 'setup':
      return state.config.durationMs;
    case 'countdown':
      return state.config.durationMs;
    case 'live':
      return Math.max(0, (state.endsAtMs ?? nowMs) - nowMs);
    case 'finished':
      return 0;
  }
}

export function averageQuality(score: ParticipantScore): number {
  return score.reps === 0 ? 0 : score.qualitySum / score.reps;
}

/** Most valid reps wins; ties are broken by average rep quality. */
export function computeResult(state: MatchState): MatchResult {
  const standings: ParticipantResult[] = state.config.participants
    .map((participant) => {
      const score = state.scores[participant.id] ?? EMPTY_SCORE;
      return { participant, score, averageQuality: averageQuality(score), rank: 0 };
    })
    .sort((a, b) => b.score.reps - a.score.reps || b.averageQuality - a.averageQuality);

  standings.forEach((s, i) => {
    const prev = standings[i - 1];
    const tied =
      prev && prev.score.reps === s.score.reps && prev.averageQuality === s.averageQuality;
    s.rank = tied ? prev.rank : i + 1;
  });

  return {
    matchId: state.config.id,
    mode: state.config.mode,
    exerciseId: state.config.exerciseId,
    timeControlId: state.config.timeControlId,
    durationMs: state.config.durationMs,
    finishedAtMs: state.finishedAtMs ?? 0,
    finishReason: state.finishReason ?? 'aborted',
    standings,
  };
}
