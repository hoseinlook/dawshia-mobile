import type { ExerciseDefinition } from '../types';
import { DipAnalyzer } from './dipAnalyzer';

export const dip: ExerciseDefinition = {
  id: 'dip',
  camera: { orientation: 'portrait', view: 'side' },
  competitions: ['bullet', 'blitz', 'rapid', 'endurance'],
  createAnalyzer: () => new DipAnalyzer(),
};
