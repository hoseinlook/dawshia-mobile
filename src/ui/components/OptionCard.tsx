import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n/useI18n';
import { colors, radius, spacing } from '../theme';

interface Props {
  selected: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Selectable card used for pickers (exercise, time control, language). */
export function OptionCard({ selected, title, subtitle, onPress, style }: Props) {
  const { textStart } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionSelected, style]}
    >
      <Text style={[styles.title, textStart]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, textStart]}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 2,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
