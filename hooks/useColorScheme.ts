import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors } from '@/constants/Colors';

export function useColorScheme(): 'light' | 'dark' {
  const scheme = useRNColorScheme();
  if (scheme === 'dark') return 'dark';
  return 'light';
}

export function useThemeColors() {
  const scheme = useColorScheme();
  return Colors[scheme];
}
