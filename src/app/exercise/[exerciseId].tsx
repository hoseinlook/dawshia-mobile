import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise } from '../../core/exercises/registry';
import type { TimeControlId } from '../../core/match/timeControls';
import { personalBest } from '../../core/progress/progress';
import { useHistory } from '../../features/progress/useHistory';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { OptionCard } from '../../ui/components/OptionCard';
import { exerciseIcon } from '../../ui/exerciseIcons';
import { haptics } from '../../ui/haptics';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../../ui/theme';

/** Step 2 of the menu: pick one of the competition types this movement offers. */
export default function ExerciseScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir, isRTL } = useI18n();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const exercise = getExercise(exerciseId);
  const history = useHistory();
  const [competition, setCompetition] = useState<TimeControlId | undefined>(exercise?.competitions[0]);

  if (!exercise || !competition) return <Redirect href="/" />;
  const text = exerciseText(m, exercise.id);
  const best = history ? personalBest(history, exercise.id, competition) : 0;

  const start = () =>
    router.push({
      pathname: '/session/[exerciseId]',
      params: { exerciseId: exercise.id, timeControl: competition, mode: 'practice' },
    });

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={m.common.back}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name={exerciseIcon(exercise.id)} size="xl" color={colors.accent} />
          </View>
          <AppText variant="title" center>
            {text.name}
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            {text.description}
          </AppText>
        </View>

        <AppText variant="heading" start style={styles.section}>
          {m.competition.title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} start>
          {m.competition.timedRepsRule}
        </AppText>
        {exercise.competitions.map((id) => {
          const tc = timeControlText(m, id);
          const pb = history ? personalBest(history, exercise.id, id) : 0;
          return (
            <OptionCard
              key={id}
              icon="timer-outline"
              iconColor={colors.gold}
              title={tc.label}
              subtitle={tc.description}
              meta={pb > 0 ? f(m.game.personalBest, { reps: pb }) : undefined}
              selected={id === competition}
              onPress={() => {
                haptics.select();
                setCompetition(id);
              }}
            />
          );
        })}

        {/* Clear, achievable target (flow): beat your previous best. */}
        <View style={styles.goal}>
          <Icon name="trophy-outline" color={colors.gold} />
          <AppText variant="bodyBold" color={colors.gold} start style={styles.goalText}>
            {best > 0 ? f(m.game.beatYourBest, { reps: best }) : m.game.noBestYet}
          </AppText>
        </View>

        <Button label={m.home.startPractice} icon="lightning-bolt" onPress={start} large />
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
    padding: spacing.md,
    gap: spacing.sm,
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
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3DDC971F',
    transform: [{ rotate: '-4deg' }],
  },
  section: {
    marginTop: spacing.sm,
  },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFC14514',
    borderWidth: 1,
    borderColor: colors.goldDim,
  },
  goalText: {
    flex: 1,
  },
});
