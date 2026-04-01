/**
 * Layout tokens used throughout the app for consistent spacing,
 * border radii, and font sizes.
 */
import { Platform } from 'react-native';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
  display: 42,
} as const;

/**
 * Typography families — Libre Baskerville (a classic serif) for headings,
 * system default (sans-serif) for body / UI text.
 * The font names must match the keys loaded by useFonts in _layout.tsx.
 */
export const FontFamily = {
  serifRegular: 'LibreBaskerville_400Regular',
  serifItalic: 'LibreBaskerville_400Regular_Italic',
  serifBold: 'LibreBaskerville_700Bold',
  sans: Platform.select({ ios: 'System', default: 'sans-serif' }) as string,
};
