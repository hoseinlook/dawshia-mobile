import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  /** Large call-to-action size. */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

const FILL: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  gold: { bg: colors.gold, fg: colors.onGold },
  secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
};

/** Button with a visible pressed state (opacity + scale, no layout shift) and ≥48dp height. */
export function Button({ label, onPress, variant = 'primary', icon, disabled, large, style }: Props) {
  const fill = FILL[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        { backgroundColor: fill.bg, borderColor: fill.border ?? fill.bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={large ? 'md' : 'sm'} color={fill.fg} /> : null}
        <AppText variant={large ? 'heading' : 'bodyBold'} color={fill.fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  large: {
    minHeight: 60,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
