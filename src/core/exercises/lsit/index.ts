import type { ExerciseDefinition } from '../types';
import { LsitAnalyzer } from './lsitAnalyzer';

export const lsit: ExerciseDefinition = {
  id: 'lsit',
  camera: { orientation: 'landscape', view: 'side' },
  competitions: ['resistance'],
  createAnalyzer: () => new LsitAnalyzer(),
};
