import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MatchResult } from '../core/match/types';
import { primaryScore } from '../core/match/matchReducer';
import { isGame, isHold } from '../core/match/timeControls';
import { computeGains, scoreValue, type SessionGains } from '../core/progress/progress';
import { playFanfare } from '../features/audio/useMatchAudio';
import { AchievementBadge } from '../features/progress/AchievementBadge';
import { useSettings } from '../features/settings/SettingsProvider';
import { exerciseText, timeControlText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import { useServices } from '../services/ServicesProvider';
import { AppText } from '../ui/components/AppText';
import { Button } from '../ui/components/Button';
import { Icon, type IconName } from '../ui/components/Icon';
import { ProgressBar } from '../ui/components/ProgressBar';
import { haptics } from '../ui/haptics';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing } from '../ui/theme';

/**
 * After-session screen. Closes the gamification loop with immediate, specific
 * rewards: XP and level progress, records, daily goal, streak and achievements.
 */
export default function ResultsScreen() {
  useScreenOrientation('portrait');
  const { m, f, n, dir } = useI18n();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { history } = useServices();
  const { settings } = useSettings();
  const [data, setData] = useState<{ result: MatchResult; all: MatchResult[] } | null | undefined>(undefined);

  useEffect(() => {
    Promise.all([history.get(matchId), history.list()]).then(([result, all]) =>
      setData(result ? { result, all } : null),
    );
  }, [history, matchId]);

  const gains: SessionGains | null = useMemo(
    () => (data ? computeGains(data.all, data.result, new Date()) : null),
    [data],
  );

  // Celebrate wins with one success haptic, plus a fanfare for records and level-ups.
  const musicEnabled = settings.musicEnabled;
  useEffect(() => {
    if (gains && (gains.isPersonalBest || gains.leveledUp || gains.newAchievements.length > 0 || gains.goalReached)) {
      haptics.success();
    }
    if (gains && musicEnabled && (gains.isPersonalBest || gains.leveledUp)) playFanfare();
  }, [gains, musicEnabled]);

  if (data === undefined) return <View style={styles.root} />;
  if (data === null || !gains) {
    return (
      <SafeAreaView style={[styles.root, styles.centered, dir]}>
        <AppText center>{m.results.notFound}</AppText>
        <Button label={m.common.home} onPress={() => router.dismissTo('/')} />
      </SafeAreaView>
    );
  }

  const { result } = data;
  const me = result.standings.find((s) => s.participant.isLocal) ?? result.standings[0];
  const exercise = exerciseText(m, result.exerciseId);
  const timeControl = timeControlText(m, result.timeControlId);
  const attempts = me.score.reps + me.score.rejectedReps;
  const accuracy = attempts === 0 ? 0 : Math.round((me.score.reps / attempts) * 100);
  const { after, before } = gains;
  const hold = isHold(result.timeControlId);
  const game = isGame(result.timeControlId);
  // 1v1 outcome.
  const opponent = result.standings.find((s) => !s.participant.isLocal) ?? null;
  const outcome = !opponent
    ? null
    : result.finishReason === 'forfeit' && me.rank === 1
      ? 'opponentLeft'
      : me.rank < opponent.rank
        ? 'win'
        : me.rank > opponent.rank
          ? 'lose'
          : 'draw';
  const opponentValue = opponent
    ? hold
      ? Math.floor(primaryScore(result.timeControlId, opponent.score) / 1000)
      : primaryScore(result.timeControlId, opponent.score)
    : 0;

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="label" color={colors.textMuted} center>
          {exercise.name} · {timeControl.label}
          {result.finishReason === 'aborted' ? ` · ${m.results.stoppedEarly}` : ''}
        </AppText>

        {outcome ? (
          <View
            style={[
              styles.outcome,
              { borderColor: outcome === 'lose' ? colors.opponent : outcome === 'draw' ? colors.border : colors.gold },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Icon
              name={outcome === 'lose' ? 'shield-outline' : outcome === 'draw' ? 'scale-balance' : 'trophy'}
              size="lg"
              color={outcome === 'lose' ? colors.opponent : outcome === 'draw' ? colors.text : colors.gold}
            />
            <View style={styles.flex}>
              <AppText variant="title" color={outcome === 'lose' ? colors.opponent : colors.gold} start>
                {outcome === 'opponentLeft' ? m.online.win : m.online[outcome]}
              </AppText>
              <AppText variant="label" color={colors.textMuted} start>
                {outcome === 'opponentLeft'
                  ? m.online.opponentLeft
                  : `${m.online.vs} ${opponent!.participant.displayName}: ${n(scoreValue(result))} — ${n(opponentValue)}`}
              </AppText>
            </View>
          </View>
        ) : null}
        {result.rating ? (
          <View style={styles.rating}>
            <Icon name="chart-line" size="sm" color={colors.gold} />
            <AppText variant="bodyBold" color={colors.gold}>
              {m.online.rating}: {n(result.rating.before)} → {n(result.rating.after)} (
              {n(`${result.rating.after >= result.rating.before ? '+' : ''}${result.rating.after - result.rating.before}`)})
            </AppText>
          </View>
        ) : null}

        <View style={styles.hero}>
          <AppText style={[styles.big, gains.isPersonalBest && { color: colors.gold }]} accessibilityRole="header">
            {n(scoreValue(result))}
          </AppText>
          <AppText variant="heading" center>
            {game ? m.game.pipesPassed : hold ? m.game.holdTime : m.results.validReps}
          </AppText>
          {gains.isPersonalBest ? (
            <Chip icon="trophy" label={m.game.newRecord} color={colors.gold} />
          ) : gains.previousBest > 0 ? (
            <Chip
              icon="trophy-outline"
              label={
                game
                  ? f(m.game.personalBestGame, { count: gains.previousBest })
                  : hold
                    ? f(m.game.personalBestHold, { seconds: gains.previousBest })
                    : f(m.game.personalBest, { reps: gains.previousBest })
              }
              color={colors.textMuted}
              outline
            />
          ) : null}
        </View>

        {/* XP and level */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AppText style={styles.xp}>{f(m.game.xpGained, { xp: gains.xp })}</AppText>
            <AppText variant="label" color={colors.gold}>
              {m.ranks[after.rank]} · {f(m.game.level, { level: after.level.level })}
            </AppText>
          </View>
          {gains.leveledUp ? <Chip icon="star-four-points" label={m.game.levelUp} color={colors.gold} /> : null}
          <ProgressBar
            from={gains.leveledUp ? 0 : before.level.progress}
            value={after.level.progress}
            color={colors.gold}
            height={12}
            label={f(m.game.xpToNext, { xp: after.level.xpForNext - after.level.xpIntoLevel })}
          />
          <AppText variant="caption" color={colors.textMuted} start>
            {f(m.game.xpToNext, { xp: after.level.xpForNext - after.level.xpIntoLevel })}
          </AppText>
        </View>

        {/* Daily goal + streak */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.inline}>
              <Icon name="target" size="sm" color={gains.goalReached || after.todayReps >= after.dailyGoal ? colors.accent : colors.text} />
              <AppText variant="bodyBold">
                {after.todayReps >= after.dailyGoal ? m.game.dailyGoalDone : m.game.dailyGoal}
              </AppText>
            </View>
            <AppText variant="label" color={colors.textMuted}>
              {f(m.game.dailyGoalProgress, { done: Math.min(after.todayReps, after.dailyGoal), goal: after.dailyGoal })}
            </AppText>
          </View>
          <ProgressBar
            from={before.todayReps / before.dailyGoal}
            value={after.todayReps / after.dailyGoal}
            color={after.todayReps >= after.dailyGoal ? colors.accent : colors.flame}
            height={12}
          />
          <View style={styles.inline}>
            <Icon name="fire" size="sm" color={colors.flame} />
            <AppText variant="label" color={colors.flame}>
              {f(m.game.streak, { days: after.streak.current })}
            </AppText>
          </View>
        </View>

        {/* Newly unlocked achievements */}
        {gains.newAchievements.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="heading" color={colors.gold} start>
              {m.game.newAchievements}
            </AppText>
            {gains.newAchievements.map((id) => (
              <AchievementBadge key={id} id={id} unlocked />
            ))}
          </View>
        ) : null}

        {hold || game ? null : (
          <View style={styles.stats}>
            <Stat label={m.results.formScore} value={n(Math.round(me.averageQuality * 100))} />
            <Stat label={m.results.rejected} value={n(me.score.rejectedReps)} />
            <Stat label={m.results.accuracy} value={n(`${accuracy}%`)} />
          </View>
        )}

        <Button
          label={m.results.goAgain}
          icon="lightning-bolt"
          large
          onPress={() =>
            router.replace({
              pathname: '/session/[exerciseId]',
              params: { exerciseId: result.exerciseId, timeControl: result.timeControlId, mode: result.mode },
            })
          }
        />
        <Button label={m.common.home} variant="ghost" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ icon, label, color, outline }: { icon: IconName; label: string; color: string; outline?: boolean }) {
  return (
    <View style={[styles.chip, outline ? { borderColor: color } : { backgroundColor: color, borderColor: color }]}>
      <Icon name={icon} size="sm" color={outline ? color : colors.onGold} />
      <AppText variant="bodyBold" color={outline ? color : colors.onGold}>
        {label}
      </AppText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="number">{value}</AppText>
      <AppText variant="caption" color={colors.textMuted} center>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  big: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 120,
    lineHeight: 128,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  xp: {
    color: colors.gold,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  section: {
    gap: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
