/**
 * BarChart — simple vertical bar chart for weight history.
 * Each bar represents one data point (e.g. a day's weight log).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing } from '@/constants/Spacing';

interface BarChartProps {
  /** Array of { label, value } points to render as bars */
  data: { label: string; value: number }[];
  /** Color for the bars */
  barColor?: string;
  /** Height of the entire chart area */
  height?: number;
  /** Optional label shown below the chart, e.g. "Current: 74.2 kg" */
  footnote?: string;
  footnoteColor?: string;
}

export function BarChart({
  data,
  barColor = '#1A1A1A',
  height = 120,
  footnote,
  footnoteColor = '#8C8C8C',
}: BarChartProps) {
  if (data.length === 0) return null;

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const barGap = 4;
  const barMinHeight = 8;

  return (
    <View style={styles.container}>
      <View style={[styles.chartRow, { height }]}>
        {data.map((point, i) => {
          const normalised = (point.value - minVal) / range;
          const barHeight = Math.max(normalised * (height - 20), barMinHeight);
          return (
            <View key={i} style={styles.barColumn}>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: barColor,
                      marginHorizontal: barGap / 2,
                    },
                  ]}
                />
              </View>
              {/* Show label for first, middle, and last bars */}
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <Text style={styles.barLabel} numberOfLines={1}>
                  {point.label}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {footnote && (
        <Text style={[styles.footnote, { color: footnoteColor }]}>{footnote}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  bar: {
    borderRadius: 3,
    minWidth: 6,
  },
  barLabel: {
    fontSize: 9,
    color: '#8C8C8C',
    marginTop: 4,
    textAlign: 'center',
  },
  footnote: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
