import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../../i18n/useI18n';
import { AppText } from '../../../ui/components/AppText';
import { colors, radius, spacing, fonts } from '../../../ui/theme';

interface Props {
  title: string;
  instructions: string[];
  inPosition: boolean;
  readiness: number;
  status: string;
}

/** Shown before the countdown: placement instructions + "hold position" progress. */
export function SetupGuide({ title, instructions, inPosition, readiness, status }: Props) {
  const { n, textStart } = useI18n();
  return (
    <View style={styles.card}>
      <AppText style={[styles.title, textStart]}>{title}</AppText>
      {instructions.map((line, i) => (
        <AppText key={line} style={[styles.step, textStart]}>
          {n(i + 1)}. {line}
        </AppText>
      ))}
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: inPosition ? colors.accent : colors.warning }]} />
        <AppText style={[styles.status, textStart]}>{status}</AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${readiness * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 460,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(11,15,26,0.85)',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bold,
    marginBottom: spacing.xs,
  },
  step: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  status: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
});
