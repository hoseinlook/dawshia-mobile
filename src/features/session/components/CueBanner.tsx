import { StyleSheet, Text, View } from 'react-native';

import type { FormCue } from '../../../core/exercises/types';
import { colors, radius, spacing } from '../../../ui/theme';

interface Props {
  message: string;
  severity: FormCue['severity'];
}

/** Live coaching message, e.g. "Go lower". */
export function CueBanner({ message, severity }: Props) {
  const tint = severity === 'warning' ? colors.warning : colors.textMuted;
  return (
    <View style={[styles.banner, { borderColor: tint }]}>
      <Text style={[styles.text, { color: tint }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(11,15,26,0.85)',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
