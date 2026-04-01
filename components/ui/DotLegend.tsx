/**
 * DotLegend — renders a row of colored dots with labels.
 * Used on the Plan tab to explain what each meal-category dot color means.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing } from '@/constants/Spacing';

interface LegendItem {
  color: string;
  label: string;
}

interface DotLegendProps {
  items: LegendItem[];
}

export function DotLegend({ items }: DotLegendProps) {
  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: FontSize.xs, color: '#8C8C8C' },
});
