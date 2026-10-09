import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, radius } from '../theme';

interface Props {
  /** 0..1 */
  value: number;
  /** Animate from this value on mount (e.g. XP before the session). */
  from?: number;
  color?: string;
  height?: number;
  /** Optional marker (0..1), e.g. a personal best to beat. */
  marker?: number;
  markerColor?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** Animated progress bar; jumps without animation when the OS asks for reduced motion. */
export function ProgressBar({ value, from, color = colors.accent, height = 10, marker, markerColor = colors.gold, label, style }: Props) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(clamp(from ?? value));

  useEffect(() => {
    progress.value = reduceMotion
      ? clamp(value)
      : withTiming(clamp(value), { duration: from !== undefined ? motion.celebrate : motion.base });
  }, [value, from, reduceMotion, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value) * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, fill]} />
      {marker !== undefined && marker > 0 && marker <= 1 ? (
        <View style={[styles.marker, { start: `${marker * 100}%`, backgroundColor: markerColor }]} />
      ) : null}
    </View>
  );
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: {
    height: '100%',
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    marginStart: -1.5,
  },
});
