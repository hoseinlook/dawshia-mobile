/**
 * Design tokens. "Vibrant & block-based" dark style (ui-ux-pro-max), using the
 * brand colors from the logo: green = you, red = opponent, gold = rewards/VS.
 * Text colors keep ≥4.5:1 contrast on `background` and `surface`.
 */
export const colors = {
  background: '#0B0F1A',
  surface: '#151B2B',
  surfaceRaised: '#1E2638',
  border: '#2A3348',
  text: '#F4F6FB',
  textMuted: '#9AA4BD',
  /** Primary action + "you". */
  accent: '#3DDC97',
  accentDim: '#1F6E4C',
  onAccent: '#0B0F1A',
  /** Opponent. */
  opponent: '#FF6B5B',
  /** XP, levels, records, achievements. */
  gold: '#FFC145',
  goldDim: '#5C4A1F',
  onGold: '#0B0F1A',
  /** Streak flame. */
  flame: '#FF8A3D',
  /** Game modes (Flappy Push): distinct from "you" (green), "opponent/danger" (red) and rewards (gold). */
  game: '#A78BFA',
  gameDim: '#3B2F63',
  onGame: '#0B0F1A',
  warning: '#FFC145',
  danger: '#FF5A5A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

/** Icon sizes (one family: MaterialCommunityIcons). */
export const iconSize = {
  sm: 18,
  md: 24,
  lg: 32,
  xl: 48,
} as const;

/** Motion tokens: short for feedback, longer for celebrations. */
export const motion = {
  press: 120,
  fast: 180,
  base: 280,
  slow: 600,
  celebrate: 900,
} as const;

/** Android/iOS minimum touch target. */
export const touchTarget = 48;

/** Font families (loaded in the root layout). Weight lives in the family name. */
export const fonts = {
  display: 'BarlowCondensed_800ExtraBold',
  displayBold: 'BarlowCondensed_700Bold',
  faDisplay: 'Vazirmatn_800ExtraBold',
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
} as const;
