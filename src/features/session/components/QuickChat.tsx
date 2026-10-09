import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useI18n } from '../../../i18n/useI18n';
import { AppText } from '../../../ui/components/AppText';
import { Icon } from '../../../ui/components/Icon';
import { haptics } from '../../../ui/haptics';
import { colors, radius, spacing, touchTarget } from '../../../ui/theme';
import { CHAT_CODES, type ChatCode } from '../useMatchSession';

/** Chat button + panel of preset phrases (Clash Royale style emotes). */
export function QuickChat({ onSend }: { onSend: (code: ChatCode) => boolean }) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);

  const send = (code: ChatCode) => {
    if (onSend(code)) haptics.select();
    setOpen(false);
  };

  return (
    <View style={styles.root}>
      {open ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.panel}>
          {CHAT_CODES.map((code) => (
            <Pressable
              key={code}
              onPress={() => send(code)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.phrase, pressed && styles.pressed]}
            >
              <AppText variant="label">{m.chat[code]}</AppText>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? m.chat.close : m.chat.open}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Icon name={open ? 'close' : 'message-text'} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** Speech bubble with the latest phrase of one player; the caller hides it after a few seconds. */
export function ChatBubbleView({ code, color, align }: { code: ChatCode; color: string; align: 'left' | 'right' }) {
  const { m } = useI18n();
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(300)}
      style={[styles.bubble, { borderColor: color, alignSelf: align === 'left' ? 'flex-start' : 'flex-end' }]}
      accessibilityLiveRegion="polite"
    >
      <AppText variant="bodyBold">{m.chat[code]}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-end',
  },
  panel: {
    position: 'absolute',
    bottom: touchTarget + spacing.sm,
    end: 0,
    width: 300,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(21,27,43,0.95)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  phrase: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  button: {
    width: touchTarget + 4,
    height: touchTarget + 4,
    borderRadius: (touchTarget + 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,38,56,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  bubble: {
    marginTop: spacing.sm,
    maxWidth: 240,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    backgroundColor: 'rgba(11,15,26,0.9)',
  },
});
