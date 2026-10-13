import type { ExerciseDefinition } from '../types';
import { HandstandPushupAnalyzer } from './handstandPushupAnalyzer';

export const handstandpushup: ExerciseDefinition = {
  id: 'handstandpushup',
  camera: { orientation: 'portrait', view: 'side', upsideDown: true },
  competitions: ['bullet', 'blitz', 'rapid', 'endurance'],
  createAnalyzer: () => new HandstandPushupAnalyzer(),
};
