import type { ExerciseDefinition } from '../types';
import { PushupAnalyzer } from './pushupAnalyzer';

export const pushup: ExerciseDefinition = {
  id: 'pushup',
  camera: {
    orientation: 'landscape',
    view: 'side',
  },
  competitions: ['bullet', 'blitz', 'rapid', 'endurance'],
  createAnalyzer: () => new PushupAnalyzer(),
};
