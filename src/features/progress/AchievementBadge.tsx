import { StyleSheet, View } from 'react-native';

import { ACHIEVEMENTS, type AchievementId } from '../../core/progress/progress';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Icon, type IconName } from '../../ui/components/Icon';
import { colors, radius, spacing } from '../../ui/theme';

/**
 * One achievement. Locked ones stay visible with their goal (ownership +
 * curiosity: the player always knows what to aim for next).
 */
export function AchievementBadge({ id, unlocked, compact }: { id: AchievementId; unlocked: boolean; compact?: boolean }) {
  const { m } = useI18n();
  const text = m.achievements[id];
  const icon = (ACHIEVEMENTS.find((a) => a.id === id)?.icon ?? 'medal') as IconName;
  return (
    <View
      style={[styles.badge, compact && styles.compact, unlocked ? styles.unlocked : styles.locked]}
      accessible
      accessibilityLabel={`${text.title}. ${unlocked ? '' : `${m.game.locked}. `}${text.description}`}
    >
      <View style={[styles.icon, unlocked && styles.iconUnlocked]}>
        <Icon name={unlocked ? icon : 'lock-outline'} size="md" color={unlocked ? colors.onGold : colors.textMuted} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyBold" color={unlocked ? colors.text : colors.textMuted} start numberOfLines={1}>
          {text.title}
        </AppText>
        {compact ? null : (
          <AppText variant="caption" color={colors.textMuted} start>
            {text.description}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compact: {
    paddingVertical: spacing.xs,
  },
  unlocked: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.goldDim,
  },
  locked: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  iconUnlocked: {
    backgroundColor: colors.gold,
  },
  text: {
    flex: 1,
  },
});
