import type { ExerciseDefinition } from '../types';
import { PullupAnalyzer } from './pullupAnalyzer';

export const pullup: ExerciseDefinition = {
  id: 'pullup',
  camera: {
    orientation: 'portrait',
    view: 'front',
  },
  competitions: ['bullet', 'blitz', 'rapid', 'endurance'],
  createAnalyzer: () => new PullupAnalyzer(),
};
