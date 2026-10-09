import { StyleSheet, View } from 'react-native';

import type { Progress } from '../../core/progress/progress';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Icon } from '../../ui/components/Icon';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { colors, radius, spacing } from '../../ui/theme';

/** Level badge, rank title and XP progress (competence / accomplishment). */
export function PlayerCard({ name, progress }: { name: string; progress: Progress }) {
  const { m, f, n } = useI18n();
  const { level } = progress;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.badge} accessible accessibilityLabel={f(m.game.level, { level: level.level })}>
          <AppText variant="number" color={colors.onGold}>
            {n(level.level)}
          </AppText>
        </View>
        <View style={styles.info}>
          <AppText variant="heading" start numberOfLines={1}>
            {name}
          </AppText>
          <View style={styles.rankRow}>
            <Icon name="shield-star" size="sm" color={colors.gold} />
            <AppText variant="label" color={colors.gold} start>
              {m.ranks[progress.rank]} · {f(m.game.level, { level: level.level })}
            </AppText>
          </View>
        </View>
      </View>
      <ProgressBar value={level.progress} color={colors.gold} label={f(m.game.xpToNext, { xp: level.xpForNext - level.xpIntoLevel })} />
      <View style={styles.xpRow}>
        <AppText variant="caption" color={colors.textMuted} start>
          {f(m.game.xp, { xp: progress.totalXp })}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {f(m.game.xpToNext, { xp: level.xpForNext - level.xpIntoLevel })}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.goldDim,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    transform: [{ rotate: '-4deg' }],
  },
  info: {
    flex: 1,
    gap: 2,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
