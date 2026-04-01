/**
 * AlertBanner — colored banner strip for warnings and status messages.
 * Used for high-calorie alerts on the day detail screen and expiry warnings.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, Spacing, BorderRadius } from '@/constants/Spacing';

interface AlertBannerProps {
  message: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: keyof typeof Ionicons.glyphMap;
}

const VARIANT_STYLES = {
  danger: { bg: '#FAEAE8', text: '#C75146', icon: 'alert-circle' as const },
  warning: { bg: '#FDF6E9', text: '#C4963A', icon: 'warning' as const },
  info: { bg: '#E8F5E9', text: '#2D6A4F', icon: 'information-circle' as const },
};

export function AlertBanner({ message, variant = 'warning', icon }: AlertBannerProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <View style={[styles.container, { backgroundColor: style.bg }]}>
      <Ionicons name={icon ?? style.icon} size={16} color={style.text} />
      <Text style={[styles.text, { color: style.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  text: { fontSize: FontSize.xs, fontWeight: '600', flex: 1 },
});
