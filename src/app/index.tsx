import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listExercises } from '../core/exercises/registry';
import { exerciseText } from '../i18n/lookup';
import { useI18n } from '../i18n/useI18n';
import { OptionCard } from '../ui/components/OptionCard';
import { useScreenOrientation } from '../ui/hooks/useScreenOrientation';
import { colors, radius, spacing } from '../ui/theme';

export default function HomeScreen() {
  useScreenOrientation('portrait');
  const { m, dir, textStart } = useI18n();

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>DAWSHIA</Text>
          <View style={styles.headerButtons}>
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel={m.home.profile}
              hitSlop={8}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsIcon}>👤</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel={m.home.settings}
              hitSlop={8}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsIcon}>⚙</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.tagline, textStart]}>{m.home.tagline}</Text>

        <Text style={[styles.section, textStart]}>{m.home.chooseMovement}</Text>
        {listExercises().map((e) => {
          const text = exerciseText(m, e.id);
          return (
            <OptionCard
              key={e.id}
              selected={false}
              title={text.name}
              subtitle={text.description}
              onPress={() =>
                router.push({ pathname: '/exercise/[exerciseId]', params: { exerciseId: e.id } })
              }
            />
          );
        })}

        <View style={styles.comingSoon}>
          <Text style={[styles.comingSoonTitle, textStart]}>{m.home.rankedTitle}</Text>
          <Text style={[styles.comingSoonText, textStart]}>{m.home.rankedText}</Text>
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
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  logo: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 6,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  settingsIcon: {
    color: colors.text,
    fontSize: 22,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  comingSoon: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    gap: spacing.xs,
  },
  comingSoonTitle: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  comingSoonText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
