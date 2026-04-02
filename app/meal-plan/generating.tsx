/**
 * AI meal-plan generation screen that reflects real progress across generation phases.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily } from '@/constants/Spacing';
import { ProgressSteps } from '@/components/ui';
import type { StepStatus } from '@/components/ui';
import { useMealPlanGenerationStore } from '@/stores/mealPlanGenerationStore';

const GENERATION_STEPS = [
  'Reading your nutrition profile',
  'Matching recipes and preferences',
  'Generating your weekly meals',
  'Saving your plan',
];

const LOCAL_INSIGHTS = [
  "Berkeley's heirloom tomatoes are currently at peak nutritional density.",
  'Local farmers markets have exceptional leafy greens this week.',
  'Wild-caught salmon is in season — rich in omega-3 fatty acids.',
  'Seasonal root vegetables offer excellent fiber and complex carbs.',
];

const RING_SIZE = 140;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function GeneratingScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const phase = useMealPlanGenerationStore((s) => s.phase);
  const errorMessage = useMealPlanGenerationStore((s) => s.errorMessage);
  const resetGeneration = useMealPlanGenerationStore((s) => s.resetGeneration);

  const [visualProgress, setVisualProgress] = useState(0.06);
  const insightRef = useRef(LOCAL_INSIGHTS[Math.floor(Math.random() * LOCAL_INSIGHTS.length)]);

  const currentStep = (() => {
    if (phase === 'reading_profile') return 0;
    if (phase === 'matching_preferences') return 1;
    if (phase === 'generating_weekly_meals') return 2;
    return 3;
  })();

  const targetProgress = (() => {
    if (phase === 'idle') return 0.06;
    if (phase === 'reading_profile') return 0.2;
    if (phase === 'matching_preferences') return 0.46;
    if (phase === 'generating_weekly_meals') return 0.72;
    if (phase === 'saving_plan') return 0.92;
    if (phase === 'failed') return 0.92;
    return 1;
  })();

  useEffect(() => {
    if (phase !== 'done') return;
    const doneTimer = setTimeout(() => {
      resetGeneration();
      router.replace('/(tabs)/plan' as any);
    }, 500);
    return () => clearTimeout(doneTimer);
  }, [phase, resetGeneration, router]);

  // Smoothly animate the ring toward each real phase target.
  useEffect(() => {
    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        const effectiveTarget =
          phase === 'generating_weekly_meals'
            ? 0.68 + 0.06 * ((Math.sin(Date.now() / 450) + 1) / 2)
            : targetProgress;
        const next = prev + (effectiveTarget - prev) * 0.14;
        if (Math.abs(effectiveTarget - prev) < 0.002) {
          return effectiveTarget;
        }
        return Math.max(0, Math.min(1, next));
      });
    }, 16);
    return () => clearInterval(interval);
  }, [phase, targetProgress]);

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - visualProgress);

  const steps = GENERATION_STEPS.map((label, i) => {
    let status: StepStatus = 'pending';
    if (phase === 'done') {
      status = 'done';
    } else if (i < currentStep) {
      status = 'done';
    } else if (i === currentStep && phase !== 'idle') {
      status = 'active';
    }
    return { label, status };
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Thick ring — fills clockwise from the top */}
      <View style={styles.ring}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={colors.border}
            strokeWidth={RING_STROKE}
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={colors.text}
            strokeWidth={RING_STROKE}
            strokeDasharray={`${RING_CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
      </View>

      {/* Headline */}
      <Text style={[styles.headline, { color: colors.text }]}>
        Finalizing your optimal{'\n'}nourishment plan...
      </Text>

      {/* Progress steps */}
      <ProgressSteps
        steps={steps}
        doneColor={colors.success}
        activeColor={colors.text}
        pendingColor={colors.tabIconDefault}
      />

      {phase === 'failed' && (
        <View style={styles.errorBox}>
          <Text style={[styles.errorText, { color: colors.danger || '#B42318' }]}>
            {errorMessage || 'Generation failed. Please try again.'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              resetGeneration();
              router.replace('/(tabs)/plan' as any);
            }}
          >
            <Text style={[styles.errorAction, { color: colors.tint }]}>Back to meal plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Insight */}
      <View style={styles.insightContainer}>
        <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>INSIGHT</Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          "{insightRef.current}"
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 80,
    alignItems: 'center',
  },

  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },

  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  errorBox: {
    marginTop: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorAction: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  insightContainer: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
  },
  insightLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.sm },
  insightText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.serifItalic,
    lineHeight: 20,
    textAlign: 'center',
  },
});
