import { Redirect, useLocalSearchParams } from 'expo-router';

import { getExercise } from '../../core/exercises/registry';
import { getTimeControl } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { SessionScreen } from '../../features/session/SessionScreen';

export default function SessionRoute() {
  const params = useLocalSearchParams<{ exerciseId: string; timeControl?: string; mode?: string }>();
  const exercise = getExercise(params.exerciseId);
  const timeControl = getTimeControl(params.timeControl);
  const mode: MatchMode =
    params.mode === 'ranked' || params.mode === 'friendly' ? params.mode : 'practice';

  if (!exercise) return <Redirect href="/" />;
  return <SessionScreen exercise={exercise} timeControlId={timeControl.id} mode={mode} />;
}
