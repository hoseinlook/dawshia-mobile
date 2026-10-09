import { Text, type TextProps, type TextStyle } from 'react-native';

import { useI18n } from '../../i18n/useI18n';
import { colors, fonts } from '../theme';

export type TextVariant = 'hero' | 'title' | 'heading' | 'body' | 'bodyBold' | 'label' | 'caption' | 'number';

const SIZES: Record<TextVariant, { fontSize: number; lineHeight: number }> = {
  hero: { fontSize: 64, lineHeight: 70 },
  title: { fontSize: 30, lineHeight: 40 },
  heading: { fontSize: 20, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  bodyBold: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 18 },
  number: { fontSize: 28, lineHeight: 32 },
};

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
  /** Align to the reading start (right in Persian). Default true for body text. */
  start?: boolean;
  center?: boolean;
}

/**
 * Text with the type scale and locale-aware fonts: Barlow Condensed for display
 * numbers/Latin headings, Vazirmatn for Persian and body text.
 */
export function AppText({ variant = 'body', color = colors.text, start, center, style, ...props }: Props) {
  const { isRTL, textStart } = useI18n();
  const display = variant === 'hero' || variant === 'title' || variant === 'number';
  const family: string = display
    ? isRTL && variant !== 'number'
      ? fonts.faDisplay
      : fonts.display
    : variant === 'heading' || variant === 'bodyBold'
      ? fonts.bold
      : variant === 'label'
        ? fonts.medium
        : fonts.regular;

  const base: TextStyle = { ...SIZES[variant], fontFamily: family, color };
  const align: TextStyle | undefined = center ? { textAlign: 'center' } : start ? textStart : undefined;
  return <Text {...props} style={[base, align, style]} />;
}
