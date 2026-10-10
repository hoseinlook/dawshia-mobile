import type { ExerciseDefinition } from '../types';
import { FlappyAnalyzer } from './flappyAnalyzer';

/** "Flappy Push": steer a bird through pipes with your push-up height, face to face with the phone. */
export const flappy: ExerciseDefinition = {
  id: 'flappy',
  camera: { orientation: 'portrait', view: 'front' },
  competitions: ['flight'],
  createAnalyzer: () => new FlappyAnalyzer(),
};
