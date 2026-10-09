import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../../i18n/useI18n';
import { AppText } from '../../../ui/components/AppText';
import { colors, radius, spacing, fonts } from '../../../ui/theme';

export function formatClock(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function MatchClock({ remainingMs }: { remainingMs: number }) {
  const { n } = useI18n();
  const low = remainingMs <= 10_000;
  return (
    <View style={[styles.box, low && styles.boxLow]}>
      <AppText style={[styles.text, low && styles.textLow]}>{n(formatClock(remainingMs))}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boxLow: {
    borderColor: colors.danger,
  },
  text: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  textLow: {
    color: colors.danger,
  },
});
