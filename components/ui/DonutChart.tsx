/**
 * DonutChart — ring chart for visualizing a single macro value vs. its target.
 * Uses react-native-svg to draw two arcs: a background track and a filled arc.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { FontSize } from '@/constants/Spacing';

interface DonutChartProps {
  /** Current value (e.g. grams consumed) */
  value: number;
  /** Target value (e.g. daily goal in grams) */
  target: number;
  /** Display label below the value, e.g. "Protein" */
  label: string;
  /** Ring color for the filled portion */
  color: string;
  /** Track (background ring) color */
  trackColor?: string;
  /** Diameter of the chart in points */
  size?: number;
  /** Thickness of the ring stroke */
  strokeWidth?: number;
}

export function DonutChart({
  value,
  target,
  label,
  color,
  trackColor = '#E5E5E5',
  size = 120,
  strokeWidth = 10,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target > 0 ? Math.min(value / target, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Filled arc — starts from top (rotate -90°) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[styles.labelOverlay, { width: size, height: size }]}>
        <Text style={[styles.valueText, { color }]}>{Math.round(value)}g</Text>
        <Text style={styles.labelText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  labelOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: { fontSize: FontSize.lg, fontWeight: '700' },
  labelText: { fontSize: FontSize.xs, color: '#8C8C8C', marginTop: 2 },
});
