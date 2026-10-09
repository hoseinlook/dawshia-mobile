import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise } from '../../core/exercises/registry';
import type { TimeControlId } from '../../core/match/timeControls';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { Button } from '../../ui/components/Button';
import { OptionCard } from '../../ui/components/OptionCard';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, spacing } from '../../ui/theme';

/** Step 2 of the menu: pick one of the competition types this exercise offers. */
export default function ExerciseScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const exercise = getExercise(exerciseId);
  const [competition, setCompetition] = useState<TimeControlId | undefined>(
    exercise?.competitions[0],
  );

  if (!exercise || !competition) return <Redirect href="/" />;
  const text = exerciseText(m, exercise.id);

  const start = () =>
    router.push({
      pathname: '/session/[exerciseId]',
      params: { exerciseId: exercise.id, timeControl: competition, mode: 'practice' },
    });

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, textStart]}>{text.name}</Text>
        <Text style={[styles.description, textStart]}>{text.description}</Text>

        <Text style={[styles.section, textStart]}>{m.competition.title}</Text>
        <Text style={[styles.rule, textStart]}>{m.competition.timedRepsRule}</Text>
        <View style={styles.grid}>
          {exercise.competitions.map((id) => {
            const tc = timeControlText(m, id);
            return (
              <OptionCard
                key={id}
                selected={id === competition}
                title={tc.label}
                subtitle={tc.description}
                onPress={() => setCompetition(id)}
                style={styles.gridItem}
              />
            );
          })}
        </View>

        <Button label={m.home.startPractice} onPress={start} style={styles.cta} />
        <Button label={m.common.back} variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: '900',
    marginTop: spacing.lg,
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.lg,
  },
  rule: {
    color: colors.textMuted,
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  cta: {
    marginTop: spacing.lg,
  },
});
