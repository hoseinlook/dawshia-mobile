import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise } from '../core/exercises/registry';
import type { ExerciseTotals } from '../core/stats/repTotals';
import { format } from '../i18n/format';
import { exerciseText, timeControlText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import { useServices } from '../services/ServicesProvider';
import type { Profile } from '../services/types';
import { Button } from '../ui/components/Button';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing } from '../ui/theme';

export default function ProfileScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();
  const { profile: profileService } = useServices();
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
        <Text style={[styles.title, textStart]}>{m.profile.title}</Text>

        {failed ? (
          <View style={styles.message}>
            <Text style={[styles.muted, textStart]}>{m.profile.loadError}</Text>
            <Button label={m.profile.retry} variant="ghost" onPress={load} />
          </View>
        ) : !profile ? (
          <ActivityIndicator color={colors.text} style={styles.loading} />
        ) : (
          <>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(profile.displayName ?? m.common.you).slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.identityText}>
                <Text style={[styles.name, textStart]}>{profile.displayName ?? m.common.you}</Text>
                <Text style={[styles.source, textStart]}>
                  {profile.source === 'server' ? m.profile.fromServer : m.profile.fromDevice}
                </Text>
              </View>
            </View>

            {profile.serverUnreachable ? (
              <View>
                <Text style={[styles.warning, textStart]}>{m.profile.serverUnreachable}</Text>
                {profile.serverError ? (
                  <Text style={[styles.source, textStart]} selectable>
                    {format(m.auth.errorDetail, { detail: profile.serverError })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {profile.exercises.map((totals) => (
              <ExerciseCard key={totals.exerciseId} totals={totals} ratings={profile.ratings} />
            ))}
          </>
        )}

        <Button label={m.common.back} variant="ghost" onPress={() => router.back()} style={styles.back} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ExerciseCard({ totals, ratings }: { totals: ExerciseTotals; ratings: Profile['ratings'] }) {
  const { m, n, textStart } = useI18n();
  const exercise = getExercise(totals.exerciseId);
  const competitionRatings = (exercise?.competitions ?? []).flatMap((tc) => {
    const r = ratings[`${totals.exerciseId}.${tc}`];
    return r ? [{ tc, ...r }] : [];
  });

  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, textStart]}>{exerciseText(m, totals.exerciseId).name}</Text>
      <View style={styles.statsRow}>
        <Stat label={m.profile.today} value={n(totals.today)} highlight />
        <Stat label={m.profile.month} value={n(totals.month)} />
        <Stat label={m.profile.total} value={n(totals.total)} />
      </View>
      {competitionRatings.length > 0 ? (
        <View style={styles.ratings}>
          <Text style={[styles.ratingsTitle, textStart]}>{m.profile.ratings}</Text>
          {competitionRatings.map((r) => (
            <Text key={r.tc} style={[styles.rating, textStart]}>
              {timeControlText(m, r.tc).label}: {n(r.rating)}
              {r.provisional ? '?' : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { m } = useI18n();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statUnit}>{m.profile.reps}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: spacing.lg,
  },
  loading: {
    marginVertical: spacing.xl,
  },
  message: {
    gap: spacing.md,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 15,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDim,
  },
  avatarText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  source: {
    color: colors.textMuted,
    fontSize: 13,
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
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
  statValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    color: colors.textMuted,
    fontSize: 11,
  },
  statLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  ratings: {
    gap: 2,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  ratingsTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rating: {
    color: colors.text,
    fontSize: 14,
  },
  back: {
    marginTop: spacing.sm,
  },
});
