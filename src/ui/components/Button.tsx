import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.8 },
        style,
      ]}
    >
      <Text style={[styles.text, variant === 'primary' && styles.textPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.lg,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  ghost: {
    backgroundColor: 'rgba(11,15,26,0.7)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  textPrimary: {
    color: colors.background,
  },
});
