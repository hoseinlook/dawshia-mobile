import type { ExerciseDefinition } from '../types';
import { FlappyAnalyzer } from './flappyAnalyzer';

/** "Flappy Push": steer a bird through pipes with your push-up height. */
export const flappy: ExerciseDefinition = {
  id: 'flappy',
  camera: { orientation: 'landscape', view: 'side' },
  competitions: ['flight'],
  createAnalyzer: () => new FlappyAnalyzer(),
};
