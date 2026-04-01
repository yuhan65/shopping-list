import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Spacing, FontSize, FontFamily } from '@/constants/Spacing';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.serifRegular }]}>
        {title}
      </Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {description}
      </Text>
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} size="sm" style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: Spacing.md,
  },
});
