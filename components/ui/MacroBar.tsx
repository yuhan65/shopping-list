import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Spacing, FontSize } from '@/constants/Spacing';
import { useThemeColors } from '@/hooks/useColorScheme';

interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  unit?: string;
  color: string;
}

/**
 * Shows a macro nutrient with a colored label, progress bar, and value.
 */
export function MacroBar({ label, value, target, unit = 'g', color }: MacroBarProps) {
  const colors = useThemeColors();
  const progress = target > 0 ? Math.min(value / target, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {Math.round(value)}/{target}{unit}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: color, width: `${progress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
