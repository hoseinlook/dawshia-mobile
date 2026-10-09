import { StyleSheet, View } from 'react-native';

import type { Progress } from '../../core/progress/progress';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Icon } from '../../ui/components/Icon';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { colors, radius, spacing } from '../../ui/theme';

/**
 * Daily streak + daily goal. Clear goal for today (flow) and a gentle nudge to
 * keep the streak (loss avoidance, without punishment).
 */
export function TodayCard({ progress }: { progress: Progress }) {
  const { m, f, n } = useI18n();
  const { streak, todayReps, dailyGoal } = progress;
  const goalDone = todayReps >= dailyGoal;
  const streakText =
    streak.current === 0
      ? m.game.streakNone
      : streak.trainedToday
        ? m.game.streakDone
        : f(m.game.streakKeep, { days: streak.current });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.flame, streak.current > 0 && styles.flameOn]}>
          <Icon name={streak.current > 0 ? 'fire' : 'fire-off'} size="lg" color={streak.current > 0 ? colors.flame : colors.textMuted} />
        </View>
        <View style={styles.text}>
          <AppText variant="heading" start>
            {f(m.game.streak, { days: streak.current })}
          </AppText>
          <AppText variant="label" color={colors.textMuted} start>
            {streakText}
          </AppText>
        </View>
      </View>

      <View style={styles.goal}>
        <View style={styles.goalHeader}>
          <View style={styles.inline}>
            <Icon name="target" size="sm" color={goalDone ? colors.accent : colors.text} />
            <AppText variant="bodyBold" start>
              {goalDone ? m.game.dailyGoalDone : m.game.dailyGoal}
            </AppText>
          </View>
          <AppText variant="label" color={colors.textMuted}>
            {f(m.game.dailyGoalProgress, { done: Math.min(todayReps, dailyGoal), goal: dailyGoal })}
          </AppText>
        </View>
        <ProgressBar
          value={todayReps / dailyGoal}
          color={goalDone ? colors.accent : colors.flame}
          height={12}
          label={`${m.game.dailyGoal}: ${n(todayReps)} / ${n(dailyGoal)}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flame: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  flameOn: {
    backgroundColor: '#FF8A3D22',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  goal: {
    gap: spacing.sm,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
