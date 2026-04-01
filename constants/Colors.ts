/**
 * Editorial color palette — warm, minimal, magazine-inspired.
 * Earthy dot colors represent meal categories (protein-high, low-carb, etc.).
 */

export const Colors = {
  light: {
    text: '#1A1A1A',
    textSecondary: '#8C8C8C',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceSecondary: '#F5F5F0',
    tint: '#355E3B',
    tintLight: '#EAF1E8',
    border: '#E5E5E5',
    tabIconDefault: '#B0B0B0',
    tabIconSelected: '#355E3B',
    danger: '#C75146',
    dangerLight: '#FAEAE8',
    warning: '#C4963A',
    warningLight: '#FDF6E9',
    success: '#2D6A4F',
    successLight: '#E8F5E9',
  },
  dark: {
    text: '#F0F0EB',
    textSecondary: '#9E9E9E',
    background: '#111111',
    surface: '#1A1A1A',
    surfaceSecondary: '#252520',
    tint: '#7FA487',
    tintLight: '#27352C',
    border: '#333330',
    tabIconDefault: '#666666',
    tabIconSelected: '#7FA487',
    danger: '#E07A6F',
    dangerLight: '#2D1A18',
    warning: '#D4A94E',
    warningLight: '#2D2518',
    success: '#52B788',
    successLight: '#1A2D22',
  },
};

/**
 * Earthy accent colors for meal-type dots and macro labels.
 * Each color maps to a category shown in the weekly plan view.
 */
export const AccentColors = {
  proteinHigh: '#2D6A4F',
  lowCarb: '#C4B07B',
  plantBased: '#B5A642',
  highCal: '#C75146',
  seafood: '#C4963A',
  gold: '#C4963A',
  olive: '#8B8455',
  cream: '#C4B07B',
};

export const MacroColors = {
  protein: '#C75146',
  carbs: '#C4963A',
  fats: '#8B8455',
  fiber: '#2D6A4F',
};
