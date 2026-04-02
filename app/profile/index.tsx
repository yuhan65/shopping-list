/**
 * Profile screen — opened as a modal from the Today tab header icon.
 * Contains body stats, goals, dietary preferences, health objectives,
 * stock management link, and AI preference insights.
 * Previously the "Body" tab — now demoted to a modal since it's
 * set-once, check-occasionally (daily macros are visible on Today).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { MacroColors } from '@/constants/Colors';
import { Spacing, FontSize, FontFamily } from '@/constants/Spacing';
import { Card, DonutChart, TagChip, Button, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { minimumSafeCalories } from '@/lib/tdee';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useQueryClient } from '@tanstack/react-query';
import { formatHeightFromCm, formatHydrationFromMl, formatWeightFromKg } from '@/lib/units';
import type { Profile, BodyGoal, BodyLog, HealthObjective, MeasurementSystem } from '@/types/database';

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

export default function ProfileScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const queryClient = useQueryClient();
  const localUpsert = useLocalDataStore((s) => s.upsert);

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
  const displayedDailyCalories = goal ? Math.max(goal.daily_calories, minimumSafeCalories()) : null;

  const { data: bodyLogs } = useSupabaseQuery<BodyLog>(['body_logs'], 'body_logs', {
    filter: { user_id: user?.id },
    orderBy: { column: 'date', ascending: false },
    limit: 30,
  });

  const measurementSystem: MeasurementSystem = profile?.measurement_system ?? 'imperial';
  const latestWeight = bodyLogs?.[0]?.weight_kg;
  const weightDisplay = formatWeightFromKg(latestWeight, measurementSystem, { decimals: 0 });
  const heightDisplay = formatHeightFromCm(profile?.height_cm, measurementSystem);

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

  const hydrationTarget = formatHydrationFromMl(goal?.hydration_ml, measurementSystem);

  async function handleMeasurementSystemChange(nextSystem: MeasurementSystem) {
    if (!user || !profile || nextSystem === measurementSystem) return;
    try {
      if (isDemoMode) {
        localUpsert('profiles', { ...profile, measurement_system: nextSystem });
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({ measurement_system: nextSystem })
          .eq('id', profile.id);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
    } catch (err: any) {
      Alert.alert('Could not update units', err.message ?? 'Please try again.');
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Headline */}
      <Text style={[styles.headline, { color: colors.text }]}>
        Your biology — Optimized at {weightDisplay}
      </Text>

      {/* Body stats */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>BODY STATS</Text>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CURRENT WEIGHT</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatWeightFromKg(latestWeight, measurementSystem, { decimals: 1 })}
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>HEIGHT</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{heightDisplay}</Text>
          </Card>
        </View>
      </View>

      {/* Daily Nutrition Targets */}
      <View style={styles.targetsRow}>
        <Card style={styles.targetCard}>
          <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>CALORIES</Text>
          <Text style={[styles.targetValue, { color: colors.text }]}>
            {displayedDailyCalories?.toLocaleString() || '--'}
          </Text>
          <Text style={[styles.targetUnit, { color: colors.textSecondary }]}>KCAL TARGET</Text>
        </Card>
        <Card style={styles.targetCard}>
          <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>HYDRATION</Text>
          <Text style={[styles.targetValue, { color: colors.text }]}>{hydrationTarget}</Text>
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

      {/* Measurement units */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>MEASUREMENT UNITS</Text>
        <View style={styles.unitSegmentRow}>
          {([
            { key: 'imperial', label: 'Imperial (lbs, ft, oz)' },
            { key: 'metric', label: 'Metric (kg, m, L)' },
          ] as { key: MeasurementSystem; label: string }[]).map((option) => {
            const selected = measurementSystem === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => handleMeasurementSystemChange(option.key)}
                style={[
                  styles.unitSegment,
                  {
                    backgroundColor: selected ? colors.tint : colors.surfaceSecondary,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}
              >
                <Text style={[styles.unitSegmentText, { color: selected ? '#FFF' : colors.text }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>TRACKING</Text>
        {[
          { icon: 'scale' as const, label: 'Log Weight', route: '/body-log/add' },
          { icon: 'bolt' as const, label: 'Exercise Log', route: '/body-log/exercise' },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push(item.route as any)}
          >
            <Icon name={item.icon} size={20} color={colors.tint} />
            <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
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
  content: { padding: Spacing.lg, paddingTop: 60, paddingBottom: 100 },

  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    marginBottom: Spacing.lg,
  },

  targetsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  targetCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  targetLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  targetValue: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifBold, marginVertical: 2 },
  targetUnit: { fontSize: FontSize.xs, letterSpacing: 0.5 },

  donutRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: Spacing.lg,
  },

  section: { marginBottom: Spacing.lg },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.sm },
  unitSegmentRow: { flexDirection: 'row', gap: Spacing.sm },
  unitSegment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  unitSegmentText: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },

  statsRow: { flexDirection: 'row', gap: Spacing.md },
  statCard: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  statLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: FontSize.lg, fontWeight: '600', marginTop: 4 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  toggleDot: { width: 10, height: 10, borderRadius: 5 },
  toggleLabel: { flex: 1, fontSize: FontSize.md },

  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  updateBtn: { marginBottom: Spacing.lg },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: { flex: 1, fontSize: FontSize.md },

  signOut: { alignItems: 'center', paddingVertical: Spacing.md },
  signOutText: { fontSize: FontSize.sm, fontWeight: '500' },
});
