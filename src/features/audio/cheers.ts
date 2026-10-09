import type { Locale } from '../../i18n/locales';

/**
 * Voice clips played after each valid rep, per language.
 * To change a voice, replace the file (keep the name) or add a new one here.
 * The Persian clips are generated placeholders; real recordings sound better.
 */
export const CHEER_CLIPS: Record<Locale, readonly number[]> = {
  fa: [
    require('../../../assets/sounds/cheers/fa/mashallah.m4a'),
    require('../../../assets/sounds/cheers/fa/barikalla.m4a'),
    require('../../../assets/sounds/cheers/fa/dorood.m4a'),
    require('../../../assets/sounds/cheers/fa/bahbah.m4a'),
  ],
  en: [
    require('../../../assets/sounds/cheers/en/nice.m4a'),
    require('../../../assets/sounds/cheers/en/yes.m4a'),
    require('../../../assets/sounds/cheers/en/great-rep.m4a'),
    require('../../../assets/sounds/cheers/en/boom.m4a'),
    require('../../../assets/sounds/cheers/en/strong.m4a'),
  ],
};

/** Random index in [0, count) that differs from `previous` when possible. */
export function pickNext(count: number, previous: number, random = Math.random): number {
  if (count <= 1) return 0;
  const next = Math.floor(random() * (count - 1));
  return next >= previous && previous >= 0 ? next + 1 : next;
}
