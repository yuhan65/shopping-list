/**
 * SwapCard — AI recommendation card showing an alternative meal
 * with its calorie impact and a "SWAP" action button.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontSize, Spacing, BorderRadius, FontFamily } from '@/constants/Spacing';

interface SwapCardProps {
  title: string;
  /** Description, e.g. "Reduces total day by 320 kcal" */
  subtitle: string;
  /** Whether this swap is marked as recommended */
  recommended?: boolean;
  onSwap?: () => void;
  accentColor?: string;
}

export function SwapCard({
  title,
  subtitle,
  recommended = false,
  onSwap,
  accentColor = '#2D6A4F',
}: SwapCardProps) {
  return (
    <View style={[styles.container, { borderColor: '#E5E5E5' }]}>
      {recommended && (
        <View style={styles.badge}>
          <View style={[styles.badgeDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.badgeText, { color: accentColor }]}>RECOMMENDED</Text>
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.info}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity
          style={[styles.swapBtn, { borderColor: '#1A1A1A' }]}
          onPress={onSwap}
          activeOpacity={0.7}
        >
          <Text style={styles.swapText}>SWAP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  info: { flex: 1 },
  title: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.serifItalic,
    color: '#1A1A1A',
  },
  subtitle: { fontSize: FontSize.xs, color: '#8C8C8C', marginTop: 2 },
  swapBtn: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  swapText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#1A1A1A',
  },
});
