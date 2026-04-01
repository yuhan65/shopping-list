/**
 * Body tab — shows the user's biological profile with nutrition targets,
 * macro donut charts, weight history, dietary preferences, and health objectives.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useColorScheme';
import { MacroColors } from '@/constants/Colors';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, DonutChart, BarChart, TagChip, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { Profile, BodyGoal, BodyLog, HealthObjective } from '@/types/database';

const HEALTH_OBJECTIVES: { key: HealthObjective; label: string }[] = [
  { key: 'longevity', label: 'Longevity' },
  { key: 'cognitive_focus', label: 'Cognitive Focus' },
  { key: 'muscle_hypertrophy', label: 'Muscle Hypertrophy' },
  { key: 'metabolic_health', label: 'Metabolic Health' },
  { key: 'inflammation_reduction', label: 'Inflammation Reduction' },
  { key: 'performance', label: 'Performance' },
];

const DIETARY_PREFS = [
  { key: 'protein_high', label: 'Protein High' },
  { key: 'low_carb', label: 'Low Carb' },
  { key: 'plant_based', label: 'Plant Based' },
  { key: 'seafood_only', label: 'Seafood Only' },
];

export default function BodyScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const queryClient = useQueryClient();

  const { data: profiles } = useSupabaseQuery<Profile>(['profile'], 'profiles', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const profile = profiles?.[0];

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: bodyLogs } = useSupabaseQuery<BodyLog>(['body_logs'], 'body_logs', {
    filter: { user_id: user?.id },
    orderBy: { column: 'date', ascending: false },
    limit: 30,
  });

  const latestWeight = bodyLogs?.[0]?.weight_kg;

  // Weight display — use kg, show as lbs for editorial headline
  const weightDisplay = latestWeight ? `${Math.round(latestWeight * 2.205)} lbs` : '--';

  // Bar chart data from body logs (reverse so oldest is first)
  const weightChartData = useMemo(() => {
    if (!bodyLogs || bodyLogs.length === 0) return [];
    return [...bodyLogs].reverse().map((log) => ({
      label: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: log.weight_kg,
    }));
  }, [bodyLogs]);

  // Local toggles for dietary preferences
  const [dietToggles, setDietToggles] = useState<Record<string, boolean>>(() => {
    const restrictions = profile?.dietary_restrictions || [];
    const map: Record<string, boolean> = {};
    DIETARY_PREFS.forEach((p) => {
      map[p.key] = restrictions.some((r) => r.toLowerCase().replace(/[\s-]/g, '_') === p.key);
    });
    return map;
  });

  const [selectedObjectives, setSelectedObjectives] = useState<HealthObjective[]>(
    () => (profile?.health_objectives as HealthObjective[]) || []
  );

  function toggleObjective(key: HealthObjective) {
    setSelectedObjectives((prev) =>
      prev.includes(key) ? prev.filter((o) => o !== key) : [...prev, key]
    );
  }

  async function handleUpdatePlan() {
    Alert.alert('Update Plan', 'This will recalculate your targets based on the changes you made.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Update',
        onPress: () => {
          router.push('/(auth)/onboarding' as any);
        },
      },
    ]);
  }

  async function handleSignOut() {
    if (isDemoMode) {
      Alert.alert('Demo Mode', 'Sign out is not available in demo mode.');
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  const hydrationTarget = goal?.hydration_ml ? (goal.hydration_ml / 1000).toFixed(1) : '3.0';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Headline */}
      <Text style={[styles.headline, { color: colors.text }]}>
        Your biology — Optimized at {weightDisplay}
      </Text>

      {/* Daily Nutrition Targets */}
      <View style={styles.targetsRow}>
        <Card style={styles.targetCard}>
          <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>CALORIES</Text>
          <Text style={[styles.targetValue, { color: colors.text }]}>
            {goal?.daily_calories?.toLocaleString() || '--'}
          </Text>
          <Text style={[styles.targetUnit, { color: colors.textSecondary }]}>KCAL TARGET</Text>
        </Card>
        <Card style={styles.targetCard}>
          <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>HYDRATION</Text>
          <Text style={[styles.targetValue, { color: colors.text }]}>{hydrationTarget}L</Text>
          <Text style={[styles.targetUnit, { color: colors.textSecondary }]}>WATER INTAKE</Text>
        </Card>
      </View>

      {/* Macro donut charts */}
      {goal && (
        <View style={styles.donutRow}>
          <DonutChart
            value={goal.protein_g}
            target={goal.protein_g}
            label="Protein"
            color={MacroColors.protein}
            trackColor={colors.surfaceSecondary}
          />
          <DonutChart
            value={goal.fat_g}
            target={goal.fat_g}
            label="Fats"
            color={MacroColors.fats}
            trackColor={colors.surfaceSecondary}
          />
        </View>
      )}

      {/* Weight History */}
      {weightChartData.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>WEIGHT HISTORY</Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              LAST {weightChartData.length} DAYS
            </Text>
          </View>
          <BarChart
            data={weightChartData}
            barColor={colors.text}
            height={100}
            footnote={latestWeight ? `Current: ${latestWeight} kg` : undefined}
            footnoteColor={colors.textSecondary}
          />
        </View>
      )}

      {/* Calorie Target */}
      {goal && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>CALORIE TARGET</Text>
          <View style={styles.calTargetRow}>
            <Text style={[styles.calTargetValue, { color: colors.text }]}>
              {goal.daily_calories.toLocaleString()}
            </Text>
            <Text style={[styles.calTargetUnit, { color: colors.textSecondary }]}>kcal / day</Text>
            <View style={[styles.suggestedBadge, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.suggestedText, { color: colors.textSecondary }]}>SUGGESTED</Text>
            </View>
          </View>
        </View>
      )}

      {/* Dietary Preferences */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>DIETARY PREFERENCES</Text>
        {DIETARY_PREFS.map((pref) => (
          <View key={pref.key} style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.toggleDot, { backgroundColor: colors.textSecondary }]} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>{pref.label}</Text>
            <Switch
              value={dietToggles[pref.key] || false}
              onValueChange={(val) => setDietToggles((prev) => ({ ...prev, [pref.key]: val }))}
              trackColor={{ false: colors.border, true: colors.text }}
              thumbColor={colors.background}
            />
          </View>
        ))}
      </View>

      {/* Health Objectives */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>HEALTH OBJECTIVES</Text>
        <View style={styles.chipContainer}>
          {HEALTH_OBJECTIVES.map((obj) => (
            <TagChip
              key={obj.key}
              label={obj.label}
              selected={selectedObjectives.includes(obj.key)}
              onPress={() => toggleObjective(obj.key)}
              selectedColor={colors.text}
              selectedTextColor={colors.background}
              defaultColor={colors.surfaceSecondary}
              defaultTextColor={colors.text}
            />
          ))}
        </View>
      </View>

      {/* Update My Plan */}
      <Button
        title="Update My Plan"
        onPress={handleUpdatePlan}
        size="lg"
        style={styles.updateBtn}
      />

      {/* Quick links */}
      <View style={styles.menuSection}>
        {[
          { icon: 'scale-outline' as const, label: 'Log Weight', route: '/body-log/add' },
          { icon: 'barbell-outline' as const, label: 'Exercise Log', route: '/body-log/exercise' },
          { icon: 'water-outline' as const, label: 'Log Hydration', route: '/body-log/add' },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push(item.route as any)}
          >
            <Ionicons name={item.icon} size={20} color={colors.tint} />
            <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign out */}
      <TouchableOpacity onPress={handleSignOut} style={styles.signOut}>
        <Text style={[styles.signOutText, { color: colors.danger }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: 70, paddingBottom: 100 },

  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    marginBottom: Spacing.lg,
  },

  // Targets
  targetsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  targetCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  targetLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  targetValue: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifBold, marginVertical: 2 },
  targetUnit: { fontSize: FontSize.xs, letterSpacing: 0.5 },

  // Donut charts
  donutRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: Spacing.lg,
  },

  // Sections
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.sm },
  sectionMeta: { fontSize: FontSize.xs },

  // Calorie target
  calTargetRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  calTargetValue: { fontSize: FontSize.xxxl, fontFamily: FontFamily.serifBold },
  calTargetUnit: { fontSize: FontSize.sm },
  suggestedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  suggestedText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  // Dietary toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  toggleDot: { width: 10, height: 10, borderRadius: 5 },
  toggleLabel: { flex: 1, fontSize: FontSize.md },

  // Health objectives
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // Update button
  updateBtn: { marginBottom: Spacing.lg },

  // Menu links
  menuSection: { marginBottom: Spacing.lg },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: { flex: 1, fontSize: FontSize.md },

  // Sign out
  signOut: { alignItems: 'center', paddingVertical: Spacing.md },
  signOutText: { fontSize: FontSize.sm, fontWeight: '500' },
});
