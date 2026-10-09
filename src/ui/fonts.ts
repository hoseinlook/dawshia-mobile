// Import each weight from its own file so only these 6 fonts are bundled
// (the packages' main entry would pull in every weight and italic, ~4 MB).
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { Vazirmatn_400Regular } from '@expo-google-fonts/vazirmatn/400Regular';
import { Vazirmatn_500Medium } from '@expo-google-fonts/vazirmatn/500Medium';
import { Vazirmatn_700Bold } from '@expo-google-fonts/vazirmatn/700Bold';
import { Vazirmatn_800ExtraBold } from '@expo-google-fonts/vazirmatn/800ExtraBold';

/**
 * Barlow Condensed: sporty display type for numbers and Latin headings.
 * Vazirmatn: body text in Persian and English (it covers both scripts).
 */
export const FONT_ASSETS = {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_700Bold,
  Vazirmatn_800ExtraBold,
};
