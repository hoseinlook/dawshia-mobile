import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '../../ui/alert';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Icon } from '../../ui/components/Icon';
import { colors, spacing } from '../../ui/theme';
import { setMyAvatar, useMyAvatar } from './avatars';
import { pickAvatar } from './pickAvatar';

const SIZE = 112;

/** Your profile photo with a camera badge; tap to choose a new one or remove it. */
export function ProfilePhoto({ name }: { name: string }) {
  const { m } = useI18n();
  const { social } = useServices();
  const image = useMyAvatar();
  const [busy, setBusy] = useState(false);

  const save = async (next: string | null) => {
    setBusy(true);
    try {
      await setMyAvatar(social, next);
    } catch {
      showAlert(m.profile.photoError);
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    try {
      const picked = await pickAvatar();
      if (picked) await save(picked);
    } catch {
      showAlert(m.profile.photoError);
    }
  };

  const onPress = () => {
    if (!image) {
      choose();
      return;
    }
    showAlert(m.profile.changePhoto, undefined, [
      { text: m.profile.choosePhoto, onPress: choose },
      { text: m.profile.removePhoto, style: 'destructive', onPress: () => save(null) },
      { text: m.profile.cancel, style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.root}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={m.profile.changePhoto}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Avatar image={image} name={name} size={SIZE} ringColor={colors.gold} />
        <View style={styles.badge}>
          {busy ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Icon name="camera" size="sm" color={colors.onAccent} />}
        </View>
      </Pressable>
      <AppText variant="heading" center style={styles.name}>
        {name}
      </AppText>
      <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" hitSlop={8} style={styles.link}>
        <AppText variant="label" color={colors.accent}>
          {m.profile.changePhoto}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.background,
  },
  name: {
    marginTop: spacing.sm,
    writingDirection: 'ltr',
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
