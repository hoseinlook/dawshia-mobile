import type { IconName } from './components/Icon';

/** Icon per movement (MaterialCommunityIcons). */
const ICONS: Record<string, IconName> = {
  pushup: 'arm-flex',
  pullup: 'human-handsup',
  muscleup: 'lightning-bolt',
  handstand: 'human-handsdown',
  dip: 'arrow-collapse-down',
  handstandpushup: 'swap-vertical-bold',
  lsit: 'alpha-l-box',
  frontlever: 'arrow-expand-horizontal',
};

export function exerciseIcon(exerciseId: string): IconName {
  return ICONS[exerciseId] ?? 'dumbbell';
}
