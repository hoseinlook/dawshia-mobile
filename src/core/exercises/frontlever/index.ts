import type { ExerciseDefinition } from '../types';
import { FrontleverAnalyzer } from './frontleverAnalyzer';

export const frontlever: ExerciseDefinition = {
  id: 'frontlever',
  camera: { orientation: 'landscape', view: 'side' },
  competitions: ['resistance'],
  createAnalyzer: () => new FrontleverAnalyzer(),
};
