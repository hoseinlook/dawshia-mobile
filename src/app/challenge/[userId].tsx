import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise, listExercises } from '../../core/exercises/registry';
import { isGame, isHold, type TimeControlId } from '../../core/match/timeControls';
import { useAvatar } from '../../features/avatar/avatars';
import { useChallenges } from '../../features/social/ChallengesProvider';
import { useFriends } from '../../features/social/FriendsProvider';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { OptionCard } from '../../ui/components/OptionCard';
import { exerciseIcon } from '../../ui/exerciseIcons';
import { haptics } from '../../ui/haptics';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../../ui/theme';

/** Fight request to an online player (friend or not): pick the movement and competition, then wait for them. */
export default function ChallengeScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir, isRTL } = useI18n();
  const { userId, username = '' } = useLocalSearchParams<{ userId: string; username?: string }>();
  const { social } = useServices();
  const { friends } = useFriends();
  const { send } = useChallenges();
  const friend = friends?.find((x) => x.userId === userId);
  const avatar = useAvatar(social, userId, friend?.avatarAt);
  const name = friend?.username ?? username;

  const exercises = listExercises();
  const [exerciseId, setExerciseId] = useState(exercises[0].id);
  const exercise = getExercise(exerciseId)!;
  const [competition, setCompetition] = useState<TimeControlId>(exercise.competitions[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The list refreshes every 30 s; the server checks again when sending.
  const offline = friend !== undefined && !friend.online;

  const pickExercise = (id: string) => {
    haptics.select();
    setExerciseId(id);
    setCompetition(getExercise(id)!.competitions[0]);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await send({ userId, username: name }, exerciseId, competition);
    } catch (e) {
      const text = e instanceof Error ? e.message : '';
      setError(
        /offline/i.test(text)
          ? f(m.challenge.offline, { username: name })
          : /too many/i.test(text)
            ? m.challenge.tooMany
            : m.challenge.sendError,
      );
      setBusy(false);
    }
  };

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
          <Avatar image={avatar} name={name} size={88} ringColor={colors.opponent} online={friend?.online} />
          <AppText variant="title" center>
            {f(m.challenge.title, { username: name })}
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            {f(m.challenge.subtitle, { username: name })}
          </AppText>
        </View>

        <AppText variant="heading" start style={styles.section}>
          {m.challenge.movement}
        </AppText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {exercises.map((x) => {
            const selected = x.id === exerciseId;
            return (
              <Pressable
                key={x.id}
                onPress={() => pickExercise(x.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.backPressed]}
              >
                <Icon name={exerciseIcon(x.id)} size="sm" color={selected ? colors.accent : colors.textMuted} />
                <AppText variant="label" color={selected ? colors.text : colors.textMuted}>
                  {exerciseText(m, x.id).name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="heading" start style={styles.section}>
          {m.challenge.competition}
        </AppText>
        {exercise.competitions.map((id) => {
          const tc = timeControlText(m, id);
          return (
            <OptionCard
              key={id}
              icon={isGame(id) ? 'bird' : isHold(id) ? 'timer-sand' : 'timer-outline'}
              iconColor={isGame(id) ? colors.game : colors.gold}
              title={tc.label}
              subtitle={tc.description}
              selected={id === competition}
              onPress={() => {
                haptics.select();
                setCompetition(id);
              }}
            />
          );
        })}

        {error || offline ? (
          <AppText variant="caption" color={colors.danger} center accessibilityRole="alert">
            {error ?? f(m.challenge.offline, { username: name })}
          </AppText>
        ) : null}
        <Button
          label={m.challenge.send}
          icon="sword-cross"
          variant="versus"
          onPress={submit}
          disabled={busy || offline}
          large
          style={styles.send}
        />
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
  section: {
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: '#13352A',
  },
  send: {
    marginTop: spacing.sm,
  },
});
