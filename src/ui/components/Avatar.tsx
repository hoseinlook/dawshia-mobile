import { Image, StyleSheet, View } from 'react-native';

import { avatarUri } from '../../features/avatar/avatars';
import { colors, fonts } from '../theme';
import { AppText } from './AppText';

interface Props {
  /** Base64 photo, or null to show the initial. */
  image: string | null;
  name: string;
  size?: number;
  /** Ring color (e.g. green = you, red = opponent). */
  ringColor?: string;
  /** Shows an online/offline dot (meaning is also given as text elsewhere). */
  online?: boolean;
}

/** Round profile photo with the first letter of the name as fallback. Decorative for screen readers. */
export function Avatar({ image, name, size = 48, ringColor, online }: Props) {
  const ring = ringColor ? 2 : 0;
  const dot = Math.max(12, Math.round(size * 0.26));
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: ringColor ?? 'transparent' },
        ]}
      >
        {image ? (
          <Image source={{ uri: avatarUri(image) }} style={{ width: size - ring * 2, height: size - ring * 2, borderRadius: size / 2 }} />
        ) : (
          <AppText style={[styles.initial, { fontSize: size * 0.45, lineHeight: size * 0.55 }]}>
            {name.slice(0, 1).toUpperCase()}
          </AppText>
        )}
      </View>
      {online !== undefined ? (
        <View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: online ? colors.accent : colors.textMuted },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  initial: {
    color: colors.text,
    fontFamily: fonts.display,
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
