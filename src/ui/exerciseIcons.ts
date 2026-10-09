import type { IconName } from './components/Icon';

/** Icon per movement (MaterialCommunityIcons). */
const ICONS: Record<string, IconName> = {
  pushup: 'arm-flex',
  pullup: 'human-handsup',
  muscleup: 'lightning-bolt',
};

export function exerciseIcon(exerciseId: string): IconName {
  return ICONS[exerciseId] ?? 'dumbbell';
}
