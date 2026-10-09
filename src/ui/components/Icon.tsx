import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, iconSize } from '../theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: string;
  /** Spoken label when the icon carries meaning on its own; omit for decorative icons. */
  label?: string;
}

/** One icon family (MaterialCommunityIcons) with size tokens. Decorative unless labelled. */
export function Icon({ name, size = 'md', color = colors.text, label }: Props) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={typeof size === 'number' ? size : iconSize[size]}
      color={color}
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
