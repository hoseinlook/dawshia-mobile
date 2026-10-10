import { Redirect, useLocalSearchParams } from 'expo-router';

import { getExercise } from '../../core/exercises/registry';
import { getTimeControl } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { SessionScreen, type SessionChallenge } from '../../features/session/SessionScreen';

export default function SessionRoute() {
  const params = useLocalSearchParams<{
    exerciseId: string;
    timeControl?: string;
    mode?: string;
    /** Friend challenge (see `challengeParams`). */
    matchId?: string;
    expiresAt?: string;
    opponent?: string;
    role?: string;
  }>();
  const exercise = getExercise(params.exerciseId);
  const timeControl = getTimeControl(params.timeControl);
  const mode: MatchMode = params.mode === 'ranked' || params.mode === 'friendly' ? params.mode : 'practice';

  const challenge: SessionChallenge | undefined =
    mode === 'friendly' && params.matchId
      ? {
          matchId: params.matchId,
          expiresAt: Number(params.expiresAt) || 0,
          opponent: params.opponent ?? '',
          role: params.role === 'received' ? 'received' : 'sent',
        }
      : undefined;

  if (!exercise) return <Redirect href="/" />;
  return <SessionScreen exercise={exercise} timeControlId={timeControl.id} mode={mode} challenge={challenge} />;
}
