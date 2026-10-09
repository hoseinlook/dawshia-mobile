import { router } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listExercises } from '../core/exercises/registry';
import { computeProgress, personalBest } from '../core/progress/progress';
import { useAuth } from '../features/auth/AuthProvider';
import { PlayerCard } from '../features/progress/PlayerCard';
import { TodayCard } from '../features/progress/TodayCard';
import { useHistory } from '../features/progress/useHistory';
import { exerciseText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import { AppText } from '../ui/components/AppText';
import { Icon, type IconName } from '../ui/components/Icon';
import { OptionCard } from '../ui/components/OptionCard';
import { exerciseIcon } from '../ui/exerciseIcons';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing, touchTarget } from '../ui/theme';

const LOGO = require('../../assets/brand/logo.png');

export default function HomeScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir } = useI18n();
  const { session } = useAuth();
  const history = useHistory();
  const progress = useMemo(() => (history ? computeProgress(history, new Date()) : null), [history]);

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
            <AppText variant="title" color={colors.accent} style={styles.wordmark}>
              DAWSHIA
            </AppText>
          </View>
          <View style={styles.headerButtons}>
            <HeaderButton icon="account-circle" label={m.home.profile} onPress={() => router.push('/profile')} />
            <HeaderButton icon="cog-outline" label={m.home.settings} onPress={() => router.push('/settings')} />
          </View>
        </View>

        {progress ? (
          <>
            <PlayerCard name={session?.username ?? m.common.you} progress={progress} />
            <TodayCard progress={progress} />
          </>
        ) : null}

        <AppText variant="heading" start style={styles.section}>
          {m.home.chooseMovement}
        </AppText>
        {listExercises().map((e) => {
          const text = exerciseText(m, e.id);
          const best = history
            ? Math.max(0, ...e.competitions.map((tc) => personalBest(history, e.id, tc)))
            : 0;
          return (
            <OptionCard
              key={e.id}
              icon={exerciseIcon(e.id)}
              title={text.name}
              subtitle={text.description}
              meta={best > 0 ? f(m.game.personalBest, { reps: best }) : undefined}
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
          <Icon name="lock-outline" color={colors.textMuted} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <Icon name={icon} size="md" />
    </Pressable>
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
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceRaised,
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
