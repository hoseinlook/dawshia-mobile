import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise } from '../core/exercises/registry';
import { ACHIEVEMENTS, computeProgress } from '../core/progress/progress';
import type { ExerciseTotals } from '../core/stats/repTotals';
import { AchievementBadge } from '../features/progress/AchievementBadge';
import { PlayerCard } from '../features/progress/PlayerCard';
import { useHistory } from '../features/progress/useHistory';
import { format } from '../i18n/format';
import { exerciseText, timeControlText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import { useServices } from '../services/ServicesProvider';
import type { Profile } from '../services/types';
import { AppText } from '../ui/components/AppText';
import { Button } from '../ui/components/Button';
import { Icon } from '../ui/components/Icon';
import { exerciseIcon } from '../ui/exerciseIcons';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../ui/theme';

export default function ProfileScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir, isRTL } = useI18n();
  const { profile: profileService } = useServices();
  const history = useHistory();
  const progress = useMemo(() => (history ? computeProgress(history, new Date()) : null), [history]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile(await profileService.getProfile());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [profileService]);

  // Reload whenever the screen is opened (e.g. after a session).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} />}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={m.common.back}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} />
          </Pressable>
          <AppText variant="title" start>
            {m.profile.title}
          </AppText>
        </View>

        {failed ? (
          <View style={styles.message}>
            <AppText color={colors.textMuted} start>
              {m.profile.loadError}
            </AppText>
            <Button label={m.profile.retry} variant="ghost" icon="sync" onPress={load} />
          </View>
        ) : !profile || !progress ? (
          <ActivityIndicator color={colors.text} style={styles.loading} />
        ) : (
          <>
            <PlayerCard name={profile.displayName ?? m.common.you} progress={progress} />

            <View style={styles.source}>
              <Icon
                name={profile.serverUnreachable ? 'wifi-off' : profile.source === 'server' ? 'sync' : 'cellphone'}
                size="sm"
                color={profile.serverUnreachable ? colors.warning : colors.textMuted}
              />
              <AppText variant="caption" color={profile.serverUnreachable ? colors.warning : colors.textMuted} start style={styles.flex}>
                {profile.serverUnreachable
                  ? m.profile.serverUnreachable
                  : profile.source === 'server'
                    ? m.profile.fromServer
                    : m.profile.fromDevice}
              </AppText>
            </View>
            {profile.serverError ? (
              <AppText variant="caption" color={colors.textMuted} start selectable>
                {/* Technical detail stays in Latin digits (IPs, ports). */}
                {format(m.auth.errorDetail, { detail: profile.serverError })}
              </AppText>
            ) : null}

            {profile.exercises.map((totals) => (
              <ExerciseCard key={totals.exerciseId} totals={totals} ratings={profile.ratings} />
            ))}

            <View style={styles.sectionHeader}>
              <AppText variant="heading" start>
                {m.game.achievements}
              </AppText>
              <AppText variant="label" color={colors.gold}>
                {f(m.game.unlockedCount, { count: progress.achievements.size, total: ACHIEVEMENTS.length })}
              </AppText>
            </View>
            {/* Unlocked first, then the next goals. */}
            {[...ACHIEVEMENTS]
              .sort((a, b) => Number(progress.achievements.has(b.id)) - Number(progress.achievements.has(a.id)))
              .map((a) => (
                <AchievementBadge key={a.id} id={a.id} unlocked={progress.achievements.has(a.id)} />
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExerciseCard({ totals, ratings }: { totals: ExerciseTotals; ratings: Profile['ratings'] }) {
  const { m, n } = useI18n();
  const exercise = getExercise(totals.exerciseId);
  const competitionRatings = (exercise?.competitions ?? []).flatMap((tc) => {
    const r = ratings[`${totals.exerciseId}.${tc}`];
    return r ? [{ tc, ...r }] : [];
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardTitle}>
        <Icon name={exerciseIcon(totals.exerciseId)} color={colors.accent} />
        <AppText variant="heading" start>
          {exerciseText(m, totals.exerciseId).name}
        </AppText>
      </View>
      <View style={styles.statsRow}>
        <Stat label={m.profile.today} value={n(totals.today)} highlight />
        <Stat label={m.profile.month} value={n(totals.month)} />
        <Stat label={m.profile.total} value={n(totals.total)} />
      </View>
      {competitionRatings.length > 0 ? (
        <View style={styles.ratings}>
          <AppText variant="caption" color={colors.textMuted} start>
            {m.profile.ratings}
          </AppText>
          {competitionRatings.map((r) => (
            <AppText key={r.tc} variant="label" start>
              {timeControlText(m, r.tc).label}: {n(r.rating)}
              {r.provisional ? '?' : ''}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { m } = useI18n();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value} ${m.profile.reps}`}>
      <AppText variant="number" color={highlight ? colors.accent : colors.text}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
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
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  back: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  backPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  loading: {
    marginVertical: spacing.xl,
  },
  message: {
    gap: spacing.md,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  ratings: {
    gap: 2,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
});
