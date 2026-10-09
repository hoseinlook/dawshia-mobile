import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise } from '../../core/exercises/registry';
import { isGame, isHold, type TimeControlId } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { useAuth } from '../../features/auth/AuthProvider';
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
  const { status } = useAuth();
  const exercise = getExercise(exerciseId);
  const history = useHistory();
  const [competition, setCompetition] = useState<TimeControlId | undefined>(exercise?.competitions[0]);

  if (!exercise || !competition) return <Redirect href="/" />;
  const text = exerciseText(m, exercise.id);
  const best = history ? personalBest(history, exercise.id, competition) : 0;
  const hold = isHold(competition);
  const game = isGame(competition);
  const tint = game ? colors.game : colors.accent;
  const signedIn = status === 'signedIn';

  const start = (mode: MatchMode) =>
    router.push({
      pathname: '/session/[exerciseId]',
      params: { exerciseId: exercise.id, timeControl: competition, mode },
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
          <View style={[styles.heroIcon, { backgroundColor: `${tint}1F` }]}>
            <Icon name={exerciseIcon(exercise.id)} size="xl" color={tint} />
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
          {game ? m.competition.gameRule : hold ? m.competition.holdRule : m.competition.timedRepsRule}
        </AppText>
        {exercise.competitions.map((id) => {
          const tc = timeControlText(m, id);
          const pb = history ? personalBest(history, exercise.id, id) : 0;
          return (
            <OptionCard
              key={id}
              icon={isGame(id) ? 'bird' : isHold(id) ? 'timer-sand' : 'timer-outline'}
              iconColor={isGame(id) ? colors.game : colors.gold}
              title={tc.label}
              subtitle={tc.description}
              meta={
                pb > 0
                  ? isGame(id)
                    ? f(m.game.personalBestGame, { count: pb })
                    : isHold(id)
                      ? f(m.game.personalBestHold, { seconds: pb })
                      : f(m.game.personalBest, { reps: pb })
                  : undefined
              }
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
            {best > 0
              ? game
                ? f(m.game.beatYourBestGame, { count: best })
                : hold
                  ? f(m.game.beatYourBestHold, { seconds: best })
                  : f(m.game.beatYourBest, { reps: best })
              : m.game.noBestYet}
          </AppText>
        </View>

        <Button
          label={m.online.practice}
          icon={game ? 'bird' : 'lightning-bolt'}
          variant={game ? 'game' : 'primary'}
          onPress={() => start('practice')}
          large
        />
        <Button
          label={m.online.ranked}
          icon="sword-cross"
          variant="versus"
          onPress={() => start('ranked')}
          disabled={!signedIn}
          large
        />
        <AppText variant="caption" color={colors.textMuted} center>
          {signedIn ? m.online.rankedHint : m.online.signInForRanked}
        </AppText>
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
