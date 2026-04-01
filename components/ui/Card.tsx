import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Spacing } from '@/constants/Spacing';
import { useThemeColors } from '@/hooks/useColorScheme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

/**
 * A minimal card with a thin border — matches the editorial aesthetic.
 */
export function Card({ children, style, padded = true }: CardProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  padded: {
    padding: Spacing.md,
  },
});
