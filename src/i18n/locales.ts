import { en } from './messages/en';
import { fa, type Messages } from './messages/fa';

export type Locale = 'fa' | 'en';

export const DEFAULT_LOCALE: Locale = 'fa';

export interface LocaleInfo {
  id: Locale;
  /** Name of the language in that language, for the language picker. */
  nativeName: string;
  rtl: boolean;
  messages: Messages;
  /** Digits used to display numbers. */
  digits: string;
}

export const LOCALES: Record<Locale, LocaleInfo> = {
  fa: { id: 'fa', nativeName: 'فارسی', rtl: true, messages: fa, digits: '۰۱۲۳۴۵۶۷۸۹' },
  en: { id: 'en', nativeName: 'English', rtl: false, messages: en, digits: '0123456789' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in LOCALES;
}
