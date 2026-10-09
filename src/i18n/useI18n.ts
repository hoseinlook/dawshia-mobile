import { useMemo } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';

import { useSettings } from '../features/settings/SettingsProvider';
import { format, localizeDigits } from './format';
import { LOCALES } from './locales';

/**
 * Current language, its messages and helpers.
 *
 * - `m`: typed message tree, e.g. `m.home.startPractice`
 * - `f(template, params)`: fills placeholders and localizes digits
 * - `n(value)`: formats a number with the locale's digits
 * - `dir` / `textStart`: styles that make a screen RTL-aware
 */
export function useI18n() {
  const { settings } = useSettings();
  const info = LOCALES[settings.locale];

  return useMemo(() => {
    const n = (value: number | string) => localizeDigits(String(value), info.digits);
    const f = (template: string, params: Record<string, string | number> = {}) =>
      localizeDigits(format(template, params), info.digits);

    const dir: ViewStyle = { direction: info.rtl ? 'rtl' : 'ltr' };
    const textStart: TextStyle = {
      textAlign: info.rtl ? 'right' : 'left',
      writingDirection: info.rtl ? 'rtl' : 'ltr',
    };

    return { locale: info.id, isRTL: info.rtl, m: info.messages, f, n, dir, textStart };
  }, [info]);
}
