import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n/useI18n';
import { colors, radius, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  /** Small highlighted line, e.g. a personal best. */
  meta?: string;
  icon?: IconName;
  iconColor?: string;
  /** Highlight color for special modes (border + badge), e.g. games. */
  accentColor?: string;
  /** Small label in the corner, e.g. "GAME". */
  badge?: string;
  selected?: boolean;
  /** Shows a chevron: the card navigates instead of selecting. */
  navigates?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Selectable or navigating card (block style) with clear pressed and selected states. */
export function OptionCard({
  title,
  subtitle,
  meta,
  icon,
  iconColor = colors.accent,
  accentColor,
  badge,
  selected,
  navigates,
  onPress,
  style,
}: Props) {
  const { isRTL } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={navigates ? 'button' : 'radio'}
      accessibilityState={navigates ? undefined : { selected: !!selected }}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      style={({ pressed }) => [
        styles.card,
        accentColor ? { borderColor: accentColor } : null,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
    >
      {badge ? (
        <View style={[styles.badge, { backgroundColor: accentColor ?? colors.accent }]}>
          <AppText variant="caption" color={colors.background}>
            {badge}
          </AppText>
        </View>
      ) : null}
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: `${iconColor}22` }]}>
          <Icon name={icon} size="lg" color={iconColor} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="heading" start>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.textMuted} start>
            {subtitle}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" color={colors.gold} start>
            {meta}
          </AppText>
        ) : null}
      </View>
      {navigates ? <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} color={colors.textMuted} /> : null}
      {selected && !navigates ? <Icon name="check-circle" color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  badge: {
    position: 'absolute',
    top: 0,
    end: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomStartRadius: radius.sm,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
