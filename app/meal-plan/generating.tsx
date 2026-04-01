/**
 * AI generation loading screen — shows animated progress steps while
 * the AI creates a meal plan. Auto-navigates back when complete.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily } from '@/constants/Spacing';
import { ProgressSteps } from '@/components/ui';
import type { StepStatus } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import type { Profile } from '@/types/database';

const GENERATION_STEPS = [
  'Calibrating Macro Targets',
  'Sourcing Local Ingredients',
  'Optimizing Prep Schedules',
  'Drafting Final Menu',
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
  const user = useAuthStore((s) => s.user);

  const { data: profiles } = useSupabaseQuery<Profile>(['profile'], 'profiles', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const location = profiles?.[0]?.location || 'your area';

  const [currentStep, setCurrentStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressFraction = (currentStep + 1) / GENERATION_STEPS.length;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progressFraction);

  // Simulate step-by-step progress
  useEffect(() => {
    function advance() {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= GENERATION_STEPS.length) {
          // All steps done — navigate back after a brief pause
          setTimeout(() => router.replace('/(tabs)'), 800);
          return prev;
        }
        timerRef.current = setTimeout(advance, 1500 + Math.random() * 1000);
        return next;
      });
    }

    timerRef.current = setTimeout(advance, 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const steps = GENERATION_STEPS.map((label, i) => {
    let status: StepStatus = 'pending';
    if (i < currentStep) status = 'done';
    else if (i === currentStep) status = 'active';
    return { label, status };
  });

  const insight = LOCAL_INSIGHTS[Math.floor(Math.random() * LOCAL_INSIGHTS.length)];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Location badge */}
      <View style={[styles.locationBadge, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.locationText, { color: colors.text }]}>
          ★ LIVE IN {location.toUpperCase()}
        </Text>
      </View>

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

      {/* Insight */}
      <View style={styles.insightContainer}>
        <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>INSIGHT</Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          "{insight}"
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

  locationBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 4,
    marginBottom: Spacing.xl,
  },
  locationText: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },

  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginBottom: Spacing.xl,
  },

  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: Spacing.xl,
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
