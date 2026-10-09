import * as Haptics from 'expo-haptics';

/** Short, meaningful haptics only (confirmations, wins) — never on every tap. */
export const haptics = {
  rep: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  rejected: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
};
