import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { colors, spacing } from '../../ui/theme';
import { useAuth } from './AuthProvider';

/** Full-screen state for online-only tabs when practicing offline. */
export function SignInRequired({ title, text }: { title: string; text: string }) {
  const { m, dir } = useI18n();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <View style={styles.content}>
        <Icon name="account-lock-outline" size="xl" color={colors.textMuted} />
        <AppText variant="heading" center>
          {title}
        </AppText>
        <AppText color={colors.textMuted} center>
          {text}
        </AppText>
        {/* Leaving offline mode returns to the sign-in screen. */}
        <Button label={m.friends.signIn} icon="login" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
});
