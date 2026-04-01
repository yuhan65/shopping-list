/**
 * TagChip — selectable pill-shaped chip for tags, dietary preferences,
 * health objectives, etc. Toggles between selected/unselected states.
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius } from '@/constants/Spacing';

interface TagChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  selectedColor?: string;
  selectedTextColor?: string;
  defaultColor?: string;
  defaultTextColor?: string;
}

export function TagChip({
  label,
  selected = false,
  onPress,
  selectedColor = '#1A1A1A',
  selectedTextColor = '#FFFFFF',
  defaultColor = '#F5F5F0',
  defaultTextColor = '#1A1A1A',
}: TagChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? selectedColor : defaultColor,
          borderColor: selected ? selectedColor : '#E5E5E5',
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? selectedTextColor : defaultTextColor },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  label: { fontSize: FontSize.sm, fontWeight: '500' },
});
