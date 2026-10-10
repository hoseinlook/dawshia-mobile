import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Icon } from '../../ui/components/Icon';
import { colors, radius, spacing } from '../../ui/theme';
import { useChat } from './ChatProvider';

const SHOW_MS = 5000;
/** Tab bar height, so the preview sits just above it. */
const TAB_BAR = 64;

/** Short preview above the tab bar when a message arrives; tap to open the chat. */
export function IncomingMessage() {
  const { m, f, dir } = useI18n();
  const { latest, dismissLatest } = useChat();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(dismissLatest, SHOW_MS);
    return () => clearTimeout(t);
  }, [latest, dismissLatest]);

  if (!latest) return null;
  const open = () => {
    dismissLatest();
    router.push({ pathname: '/chat/[userId]', params: { userId: latest.userId, username: latest.username } });
  };

  return (
    <View style={[styles.wrap, { bottom: TAB_BAR + insets.bottom + spacing.sm }]} pointerEvents="box-none">
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${f(m.messages.newFrom, { username: latest.username })}: ${latest.text}`}
        style={({ pressed }) => [styles.card, dir, pressed && styles.pressed]}
      >
        <Icon name="message-text" color={colors.accent} />
        <View style={styles.text}>
          <AppText variant="bodyBold" start numberOfLines={1}>
            {f(m.messages.newFrom, { username: latest.username })}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} start numberOfLines={2}>
            {latest.text}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
