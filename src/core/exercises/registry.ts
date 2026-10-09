import { muscleup } from './muscleup';
import { pullup } from './pullup';
import { pushup } from './pushup';
import type { ExerciseDefinition, ExerciseId } from './types';

/**
 * All exercises available in the app.
 * To add one: create `src/core/exercises/<name>/` exporting an
 * `ExerciseDefinition`, then add it to this list.
 */
const EXERCISES: readonly ExerciseDefinition[] = [pushup, pullup, muscleup];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function listExercises(): readonly ExerciseDefinition[] {
  return EXERCISES;
}

export function getExercise(id: ExerciseId): ExerciseDefinition | undefined {
  return byId.get(id);
}
