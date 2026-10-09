import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useI18n } from '../../../i18n/useI18n';
import { AppText } from '../../../ui/components/AppText';
import { Icon } from '../../../ui/components/Icon';
import { colors, fonts, motion, radius, spacing } from '../../../ui/theme';

interface Props {
  name: string;
  reps: number;
  /** Reps that fill the whole bar. */
  scaleMax: number;
  color: string;
  /** Personal best to race against (shown as a gold marker). 0 = none. */
  target?: number;
  align?: 'left' | 'right';
}

/**
 * Fighting-game style score bar: grows with every valid rep. A gold marker shows
 * the personal best (a clear goal); passing it turns the bar gold.
 * Render one per participant (two side by side for a 1v1).
 */
export function ScoreBar({ name, reps, scaleMax, color, target = 0, align = 'left' }: Props) {
  const { n } = useI18n();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(0);
  const pop = useSharedValue(1);
  const beatTarget = target > 0 && reps > target;
  const barColor = beatTarget ? colors.gold : color;

  useEffect(() => {
    const value = Math.min(1, reps / Math.max(1, scaleMax));
    fill.value = reduceMotion ? value : withSpring(value, { damping: 18 });
    if (reps > 0 && !reduceMotion) {
      pop.value = withSequence(withTiming(1.35, { duration: motion.press }), withTiming(1, { duration: motion.fast }));
    }
  }, [reps, scaleMax, fill, pop, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const rowDirection = align === 'left' ? 'row' : 'row-reverse';
  const markerAt = target > 0 ? Math.min(1, target / Math.max(1, scaleMax)) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {name}
        </AppText>
        <Animated.Text
          style={[styles.reps, { color: barColor }, popStyle]}
          accessibilityLiveRegion="polite"
        >
          {n(reps)}
        </Animated.Text>
      </View>
      <View style={[styles.track, { flexDirection: rowDirection }]}>
        <Animated.View style={[styles.fill, { backgroundColor: barColor }, fillStyle]} />
        {markerAt !== null ? (
          <View style={[styles.marker, align === 'left' ? { start: `${markerAt * 100}%` } : { end: `${markerAt * 100}%` }]} />
        ) : null}
      </View>
      {target > 0 ? (
        <View style={[styles.targetRow, { flexDirection: rowDirection }]}>
          <Icon name="trophy-outline" size="sm" color={colors.gold} />
          <AppText variant="caption" color={colors.gold}>
            {n(target)}
          </AppText>
        </View>
      ) : null}
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
  reps: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 18,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    marginStart: -2,
    backgroundColor: colors.gold,
  },
  targetRow: {
    alignItems: 'center',
    gap: 2,
  },
});
