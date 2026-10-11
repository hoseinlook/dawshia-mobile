import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../../i18n/useI18n';
import { AppText } from '../../../ui/components/AppText';
import { Icon } from '../../../ui/components/Icon';
import { haptics } from '../../../ui/haptics';
import { MAX_CHAT_LENGTH } from '../../../services/types';
import { colors, radius, spacing, touchTarget } from '../../../ui/theme';
import { CHAT_CODES, type ChatCode } from '../useMatchSession';

/**
 * Chat button + panel of preset phrases (Clash Royale style emotes).
 * With `onWrite`, the panel also offers typing your own message.
 */
export function QuickChat({ onSend, onWrite }: { onSend: (code: ChatCode) => boolean; onWrite?: () => void }) {
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
          {onWrite ? (
            <Pressable
              onPress={() => {
                setOpen(false);
                onWrite();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.phrase, styles.write, pressed && styles.pressed]}
            >
              <Icon name="keyboard-outline" size="sm" color={colors.background} />
              <AppText variant="label" color={colors.background}>
                {m.chat.write}
              </AppText>
            </Pressable>
          ) : null}
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

/** Speech bubble with the latest chat line of one player; the caller hides it after a few seconds. */
export function ChatBubbleView({ text, color, align }: { text: string; color: string; align: 'left' | 'right' }) {
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(300)}
      style={[styles.bubble, { borderColor: color, alignSelf: align === 'left' ? 'flex-start' : 'flex-end' }]}
      accessibilityLiveRegion="polite"
    >
      <AppText variant="bodyBold" numberOfLines={3}>
        {text}
      </AppText>
    </Animated.View>
  );
}

/**
 * Message bar at the top of the match screen (the keyboard opens from the
 * bottom, over the score area). Closes after sending.
 */
export function ChatComposer({ onSend, onClose }: { onSend: (text: string) => Promise<boolean>; onClose: () => void }) {
  const { m, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onSend(text);
    setBusy(false);
    if (ok) {
      haptics.select();
      onClose();
    } else {
      setFailed(true);
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={[
        styles.composer,
        { top: insets.top + spacing.sm, left: insets.left + spacing.md, right: insets.right + spacing.md },
      ]}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={m.chat.close}
        style={({ pressed }) => [styles.composerButton, pressed && styles.pressed]}
      >
        <Icon name="close" color={colors.textMuted} />
      </Pressable>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setFailed(false);
        }}
        onSubmitEditing={send}
        autoFocus
        maxLength={MAX_CHAT_LENGTH}
        returnKeyType="send"
        placeholder={failed ? m.messages.sendError : m.messages.placeholder}
        placeholderTextColor={failed ? colors.danger : colors.textMuted}
        accessibilityLabel={m.messages.placeholder}
        style={[styles.composerInput, { textAlign: isRTL ? 'right' : 'left' }, failed && styles.composerFailed]}
      />
      <Pressable
        onPress={send}
        disabled={!text.trim() || busy}
        accessibilityRole="button"
        accessibilityLabel={m.messages.send}
        style={({ pressed }) => [styles.sendButton, !text.trim() && styles.sendDisabled, pressed && styles.pressed]}
      >
        {busy ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <View style={isRTL ? styles.flip : undefined}>
            <Icon name="send" color={colors.background} />
          </View>
        )}
      </Pressable>
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
  write: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
  },
  composer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(21,27,43,0.97)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: touchTarget,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
  },
  composerFailed: {
    color: colors.danger,
  },
  sendButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  flip: {
    transform: [{ scaleX: -1 }],
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
