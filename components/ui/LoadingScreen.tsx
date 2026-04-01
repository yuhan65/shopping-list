import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useColorScheme';

export function LoadingScreen() {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
