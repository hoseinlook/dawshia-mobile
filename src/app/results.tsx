import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exerciseText, timeControlText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import type { MatchResult } from '../core/match/types';
import { useServices } from '../services/ServicesProvider';
import { Button } from '../ui/components/Button';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing } from '../ui/theme';

export default function ResultsScreen() {
  useScreenOrientation('portrait');
  const { m, n, dir } = useI18n();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { history } = useServices();
  const [result, setResult] = useState<MatchResult | null | undefined>(undefined);

  useEffect(() => {
    history.get(matchId).then((r) => setResult(r ?? null));
  }, [history, matchId]);

  if (result === undefined) return <View style={styles.root} />;
  if (result === null) {
    return (
      <SafeAreaView style={[styles.root, styles.content, dir]}>
        <Text style={styles.label}>{m.results.notFound}</Text>
        <Button label={m.common.home} onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const me = result.standings.find((s) => s.participant.isLocal) ?? result.standings[0];
  const exercise = exerciseText(m, result.exerciseId);
  const timeControl = timeControlText(m, result.timeControlId);
  const attempts = me.score.reps + me.score.rejectedReps;
  const accuracy = attempts === 0 ? 0 : Math.round((me.score.reps / attempts) * 100);

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <View style={styles.content}>
        <Text style={styles.label}>
          {exercise.name} · {timeControl.label}
          {result.finishReason === 'aborted' ? ` · ${m.results.stoppedEarly}` : ''}
        </Text>
        <Text style={styles.big}>{n(me.score.reps)}</Text>
        <Text style={styles.bigLabel}>{m.results.validReps}</Text>

        <View style={styles.stats}>
          <Stat label={m.results.formScore} value={n(Math.round(me.averageQuality * 100))} />
          <Stat label={m.results.rejected} value={n(me.score.rejectedReps)} />
          <Stat label={m.results.accuracy} value={n(`${accuracy}%`)} />
        </View>

        <Button
          label={m.results.goAgain}
          onPress={() =>
            router.replace({
              pathname: '/session/[exerciseId]',
              params: { exerciseId: result.exerciseId, timeControl: result.timeControlId, mode: result.mode },
            })
          }
        />
        <Button label={m.common.home} variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
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
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  big: {
    color: colors.accent,
    fontSize: 120,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bigLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -spacing.md,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
