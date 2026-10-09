import { router } from 'expo-router';
import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listExercises } from '../../core/exercises/registry';
import { isGame, isHold } from '../../core/match/timeControls';
import { computeProgress, personalBest } from '../../core/progress/progress';
import { useAuth } from '../../features/auth/AuthProvider';
import { PlayerCard } from '../../features/progress/PlayerCard';
import { TodayCard } from '../../features/progress/TodayCard';
import { useHistory } from '../../features/progress/useHistory';
import { usePublishProfile } from '../../features/social/usePublishProfile';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Icon } from '../../ui/components/Icon';
import { OptionCard } from '../../ui/components/OptionCard';
import { exerciseIcon } from '../../ui/exerciseIcons';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing } from '../../ui/theme';

const LOGO = require('../../../assets/brand/logo.png');

export default function HomeScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir } = useI18n();
  const { session } = useAuth();
  const history = useHistory();
  const progress = useMemo(() => (history ? computeProgress(history, new Date()) : null), [history]);
  usePublishProfile(progress);
  // Quick restart of the most recent competition (fewer taps for the core loop).
  const last = useMemo(() => {
    if (!history?.length) return null;
    const latest = history.reduce((a, b) => (b.finishedAtMs > a.finishedAtMs ? b : a));
    return listExercises().some((e) => e.id === latest.exerciseId) ? latest : null;
  }, [history]);

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
            <AppText variant="title" color={colors.accent} style={styles.wordmark}>
              DAWSHIA
            </AppText>
          </View>
        </View>

        {progress ? (
          <>
            <PlayerCard name={session?.username ?? m.common.you} progress={progress} />
            <TodayCard progress={progress} />
          </>
        ) : null}

        {last ? (
          <OptionCard
            icon="replay"
            iconColor={last.mode === 'ranked' ? colors.opponent : isGame(last.timeControlId) ? colors.game : colors.accent}
            accentColor={last.mode === 'ranked' ? colors.opponent : undefined}
            badge={last.mode === 'ranked' ? m.home.rankedTitle : undefined}
            title={f(m.home.playAgain, {
              exercise: exerciseText(m, last.exerciseId).name,
              competition: timeControlText(m, last.timeControlId).label,
            })}
            navigates
            onPress={() =>
              router.push({
                pathname: '/session/[exerciseId]',
                params: { exerciseId: last.exerciseId, timeControl: last.timeControlId, mode: last.mode },
              })
            }
          />
        ) : null}

        <AppText variant="heading" start style={styles.section}>
          {m.home.chooseMovement}
        </AppText>
        {listExercises().map((e) => {
          const text = exerciseText(m, e.id);
          const gameMode = e.competitions.every(isGame);
          const best = history
            ? Math.max(0, ...e.competitions.map((tc) => personalBest(history, e.id, tc)))
            : 0;
          return (
            <OptionCard
              key={e.id}
              icon={exerciseIcon(e.id)}
              iconColor={gameMode ? colors.game : colors.accent}
              accentColor={gameMode ? colors.game : undefined}
              badge={gameMode ? m.game.gameBadge : undefined}
              title={text.name}
              subtitle={text.description}
              meta={
                best > 0
                  ? gameMode
                    ? f(m.game.personalBestGame, { count: best })
                    : e.competitions.every(isHold)
                      ? f(m.game.personalBestHold, { seconds: best })
                      : f(m.game.personalBest, { reps: best })
                  : undefined
              }
              navigates
              onPress={() => router.push({ pathname: '/exercise/[exerciseId]', params: { exerciseId: e.id } })}
            />
          );
        })}

        <View style={styles.comingSoon}>
          <View style={styles.vsIcon}>
            <Icon name="sword-cross" size="lg" color={colors.opponent} />
          </View>
          <View style={styles.comingSoonText}>
            <AppText variant="bodyBold" start>
              {m.home.rankedTitle}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} start>
              {m.home.rankedText}
            </AppText>
          </View>
        </View>
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
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  wordmark: {
    // Brand wordmark is Latin in every language.
    fontFamily: fonts.display,
    letterSpacing: 3,
  },
  section: {
    marginTop: spacing.sm,
  },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  vsIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B5B1F',
  },
  comingSoonText: {
    flex: 1,
    gap: 2,
  },
});
