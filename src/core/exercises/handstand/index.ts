import type { ExerciseDefinition } from '../types';
import { HandstandAnalyzer } from './handstandAnalyzer';

export const handstand: ExerciseDefinition = {
  id: 'handstand',
  camera: {
    orientation: 'portrait',
    view: 'side',
  },
  // A hold has no time controls: only "resistance" (longest hold wins).
  competitions: ['resistance'],
  createAnalyzer: () => new HandstandAnalyzer(),
};
