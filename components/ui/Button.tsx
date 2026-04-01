import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Spacing';
import { useThemeColors } from '@/hooks/useColorScheme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const colors = useThemeColors();

  const containerStyles: ViewStyle[] = [
    styles.base,
    styles[`size_${size}`],
    {
      backgroundColor:
        variant === 'primary'
          ? colors.tint
          : variant === 'secondary'
          ? colors.surfaceSecondary
          : variant === 'danger'
          ? colors.danger
          : 'transparent',
      borderWidth: variant === 'outline' ? 1.5 : 0,
      borderColor: variant === 'outline' ? colors.border : undefined,
      opacity: disabled || loading ? 0.5 : 1,
    },
    style as ViewStyle,
  ];

  const textColor: string =
    variant === 'primary' || variant === 'danger'
      ? colors.background
      : variant === 'secondary'
      ? colors.text
      : variant === 'outline'
      ? colors.text
      : colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={containerStyles}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, styles[`text_${size}`], { color: textColor }]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  size_sm: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  size_md: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  size_lg: {
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  text_sm: {
    fontSize: FontSize.xs,
  },
  text_md: {
    fontSize: FontSize.sm,
  },
  text_lg: {
    fontSize: FontSize.md,
  },
});
