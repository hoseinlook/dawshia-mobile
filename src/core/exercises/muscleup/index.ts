import type { ExerciseDefinition } from '../types';
import { MuscleupAnalyzer } from './muscleupAnalyzer';

export const muscleup: ExerciseDefinition = {
  id: 'muscleup',
  camera: {
    orientation: 'portrait',
    view: 'front',
  },
  competitions: ['bullet', 'blitz', 'rapid', 'endurance'],
  createAnalyzer: () => new MuscleupAnalyzer(),
};
