/**
 * ProgressSteps — animated checklist for multi-step processes like AI generation.
 * Each step shows a checkmark, spinner, or pending state.
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, Spacing } from '@/constants/Spacing';

export type StepStatus = 'done' | 'active' | 'pending';

interface Step {
  label: string;
  status: StepStatus;
}

interface ProgressStepsProps {
  steps: Step[];
  activeColor?: string;
  doneColor?: string;
  pendingColor?: string;
}

export function ProgressSteps({
  steps,
  activeColor = '#1A1A1A',
  doneColor = '#2D6A4F',
  pendingColor = '#B0B0B0',
}: ProgressStepsProps) {
  return (
    <View style={styles.container}>
      {steps.map((step, i) => (
        <View key={i} style={styles.row}>
          {step.status === 'done' && (
            <Ionicons name="checkmark-circle" size={20} color={doneColor} />
          )}
          {step.status === 'active' && (
            <ActivityIndicator size="small" color={activeColor} />
          )}
          {step.status === 'pending' && (
            <Ionicons name="ellipse-outline" size={20} color={pendingColor} />
          )}
          <Text
            style={[
              styles.label,
              {
                color:
                  step.status === 'done'
                    ? doneColor
                    : step.status === 'active'
                      ? activeColor
                      : pendingColor,
                fontWeight: step.status === 'active' ? '600' : '400',
              },
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: { fontSize: FontSize.sm },
});
