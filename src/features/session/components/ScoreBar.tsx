import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useI18n } from '../../../i18n/useI18n';
import { colors, radius, spacing } from '../../../ui/theme';

interface Props {
  name: string;
  reps: number;
  /** Reps that fill the whole bar. */
  scaleMax: number;
  color: string;
  align?: 'left' | 'right';
}

/**
 * Fighting-game style score bar: grows with every valid rep.
 * Render one per participant (two side by side for a 1v1).
 */
export function ScoreBar({ name, reps, scaleMax, color, align = 'left' }: Props) {
  const { n } = useI18n();
  const fill = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    fill.value = withSpring(Math.min(1, reps / Math.max(1, scaleMax)), { damping: 18 });
    if (reps > 0) pop.value = withSequence(withTiming(1.35, { duration: 90 }), withTiming(1));
  }, [reps, scaleMax, fill, pop]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const rowDirection = align === 'left' ? 'row' : 'row-reverse';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Animated.Text style={[styles.reps, { color }, popStyle]}>{n(reps)}</Animated.Text>
      </View>
      <View style={[styles.track, { flexDirection: rowDirection }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xs,
  },
  header: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  reps: {
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 16,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.sm,
  },
});
