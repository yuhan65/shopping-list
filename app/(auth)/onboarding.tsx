/**
 * Onboarding flow — collects location, dietary goal, biometrics,
 * macro targets, dietary preferences, and health objectives.
 * Matches the editorial design language from the mockups.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Input, TagChip } from '@/components/ui';
import { calculateBMR, calculateTDEE, calculateDailyCalories, calculateMacros } from '@/lib/tdee';
import type { HealthObjective } from '@/types/database';

const PRIMARY_GOALS = [
  { value: 'longevity', label: 'Longevity' },
  { value: 'performance', label: 'Performance' },
  { value: 'lose', label: 'Weight Loss' },
  { value: 'gain', label: 'Muscle Gain' },
] as const;

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Lightly Active' },
  { value: 'moderate', label: 'Moderately Active' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
] as const;

const DIET_CHIPS = [
  'Plant Based',
  'High Protein',
  'Low Carb',
  'Seafood',
  'No Dairy',
  'Gluten-Free',
  'Keto',
  'Halal',
  'Kosher',
  'Nut-Free',
];

const HEALTH_OBJECTIVES: { key: HealthObjective; label: string }[] = [
  { key: 'longevity', label: 'Longevity' },
  { key: 'cognitive_focus', label: 'Cognitive Focus' },
  { key: 'muscle_hypertrophy', label: 'Muscle Hypertrophy' },
  { key: 'metabolic_health', label: 'Metabolic Health' },
  { key: 'inflammation_reduction', label: 'Inflammation Reduction' },
  { key: 'performance', label: 'Performance' },
];

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const setIsOnboarded = useAuthStore((s) => s.setIsOnboarded);
  const localUpsert = useLocalDataStore((s) => s.upsert);
  const localInsert = useLocalDataStore((s) => s.insert);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1: Culinary context
  const [location, setLocation] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<string>('longevity');

  // Step 2: Baseline biometrics
  const [weightKg, setWeightKg] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  // Step 3: Preferences & objectives
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [healthObjectives, setHealthObjectives] = useState<HealthObjective[]>([]);

  function toggleDiet(d: string) {
    setDietaryPrefs((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function toggleObjective(key: HealthObjective) {
    setHealthObjectives((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  // Map primary goal to GoalType for TDEE calculation
  function getGoalType(): 'lose' | 'maintain' | 'gain' {
    if (primaryGoal === 'lose') return 'lose';
    if (primaryGoal === 'gain') return 'gain';
    return 'maintain';
  }

  async function handleComplete() {
    if (!user) return;
    setLoading(true);
    try {
      const weight = parseFloat(weightKg) || 70;
      const height = parseFloat(heightCm) || 170;
      const ageNum = parseInt(age, 10) || 25;
      const goalType = getGoalType();

      const bmr = calculateBMR({ weightKg: weight, heightCm: height, ageYears: ageNum, sex });
      const tdee = calculateTDEE(bmr, activityLevel);
      const dailyCalories = calculateDailyCalories(tdee, goalType);
      const macros = calculateMacros(dailyCalories, goalType, weight);

      if (isDemoMode) {
        localUpsert('profiles', {
          user_id: user.id,
          display_name: 'Demo User',
          height_cm: height,
          activity_level: activityLevel,
          dietary_restrictions: dietaryPrefs,
          health_objectives: healthObjectives,
          location: location.trim() || null,
          household_size: 1,
          sex,
          age_years: ageNum,
        });

        localUpsert('body_goals', {
          user_id: user.id,
          goal_type: goalType,
          target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
          daily_calories: dailyCalories,
          protein_g: macros.proteinG,
          carbs_g: macros.carbsG,
          fat_g: macros.fatG,
          fiber_g: 35,
          hydration_ml: 3000,
        });

        localInsert('body_logs', {
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
          weight_kg: weight,
        });
      } else {
        const { error: profileError } = await supabase.from('profiles').upsert({
          user_id: user.id,
          display_name: null,
          height_cm: height,
          activity_level: activityLevel,
          dietary_restrictions: dietaryPrefs,
          health_objectives: healthObjectives,
          location: location.trim() || null,
          household_size: 1,
          sex,
          age_years: ageNum,
        });
        if (profileError) throw profileError;

        const { error: goalError } = await supabase.from('body_goals').upsert({
          user_id: user.id,
          goal_type: goalType,
          target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
          daily_calories: dailyCalories,
          protein_g: macros.proteinG,
          carbs_g: macros.carbsG,
          fat_g: macros.fatG,
          fiber_g: 35,
          hydration_ml: 3000,
        });
        if (goalError) throw goalError;

        const { error: logError } = await supabase.from('body_logs').insert({
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
          weight_kg: weight,
        });
        if (logError) throw logError;
      }

      await queryClient.invalidateQueries();
      setIsOnboarded(true);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    setIsOnboarded(true);
    router.replace('/(tabs)');
  }

  const steps = [
    // Step 0: Culinary Context
    <View key="context" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        First, let's define your culinary context.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>YOUR LOCATION</Text>
      <Input
        value={location}
        onChangeText={setLocation}
        placeholder="Berkeley, CA"
      />
      <Text style={[styles.locationNote, { color: colors.success }]}>
        ★ Sourcing from local markets
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        PRIMARY DIETARY GOAL
      </Text>
      <View style={styles.goalGrid}>
        {PRIMARY_GOALS.map((g) => (
          <TouchableOpacity
            key={g.value}
            onPress={() => setPrimaryGoal(g.value)}
            style={[
              styles.goalCard,
              {
                borderColor: primaryGoal === g.value ? colors.text : colors.border,
                backgroundColor: primaryGoal === g.value ? colors.tintLight : colors.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.goalLabel,
                { color: primaryGoal === g.value ? colors.text : colors.textSecondary },
              ]}
            >
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,

    // Step 1: Baseline Biometrics
    <View key="baseline" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>Define your baseline.</Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        Parameters for your AI nourishment plan.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BIOMETRICS</Text>
      <View style={styles.row}>
        <Input label="Current Weight" value={weightKg} onChangeText={setWeightKg} placeholder="74.2" keyboardType="numeric" containerStyle={styles.halfInput} />
        <View style={styles.unitLabel}><Text style={[styles.unitText, { color: colors.textSecondary }]}>kg</Text></View>
      </View>
      <View style={styles.row}>
        <Input label="Target Weight" value={targetWeight} onChangeText={setTargetWeight} placeholder="72.0" keyboardType="numeric" containerStyle={styles.halfInput} />
        <View style={styles.unitLabel}><Text style={[styles.unitText, { color: colors.textSecondary }]}>kg</Text></View>
      </View>
      <View style={styles.row}>
        <Input label="Height" value={heightCm} onChangeText={setHeightCm} placeholder="175" keyboardType="numeric" containerStyle={styles.halfInput} />
        <View style={styles.unitLabel}><Text style={[styles.unitText, { color: colors.textSecondary }]}>cm</Text></View>
      </View>
      <View style={styles.row}>
        <Input label="Age" value={age} onChangeText={setAge} placeholder="30" keyboardType="numeric" containerStyle={styles.halfInput} />
        <View style={[styles.halfInput, { gap: Spacing.xs }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>SEX</Text>
          <View style={styles.segmentRow}>
            {(['male', 'female'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSex(s)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: sex === s ? colors.tint : colors.surfaceSecondary,
                    borderColor: sex === s ? colors.tint : colors.border,
                  },
                ]}
              >
                <Text style={{ color: sex === s ? '#FFF' : colors.text, fontWeight: '500', fontSize: FontSize.sm }}>
                  {s === 'male' ? 'M' : 'F'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>ACTIVITY LEVEL</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activityScroll}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setActivityLevel(opt.value)}
            style={[
              styles.activityChip,
              {
                borderColor: activityLevel === opt.value ? colors.text : colors.border,
                backgroundColor: activityLevel === opt.value ? colors.tintLight : colors.surface,
              },
            ]}
          >
            <Text style={[styles.activityText, { color: activityLevel === opt.value ? colors.text : colors.textSecondary }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>,

    // Step 2: Preferences & Objectives
    <View key="prefs" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        Let's define your nutritional baseline.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DIETARY PREFERENCES</Text>
      <View style={styles.chipContainer}>
        {DIET_CHIPS.map((diet) => (
          <TagChip
            key={diet}
            label={diet}
            selected={dietaryPrefs.includes(diet)}
            onPress={() => toggleDiet(diet)}
            selectedColor={colors.text}
            selectedTextColor={colors.background}
            defaultColor={colors.surfaceSecondary}
            defaultTextColor={colors.text}
          />
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        PRIMARY HEALTH GOAL
      </Text>
      <View style={styles.chipContainer}>
        {HEALTH_OBJECTIVES.map((obj) => (
          <TagChip
            key={obj.key}
            label={obj.label}
            selected={healthObjectives.includes(obj.key)}
            onPress={() => toggleObjective(obj.key)}
            selectedColor={colors.text}
            selectedTextColor={colors.background}
            defaultColor={colors.surfaceSecondary}
            defaultTextColor={colors.text}
          />
        ))}
      </View>
    </View>,
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <View style={styles.progress}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              {
                backgroundColor: i <= step ? colors.tint : colors.border,
                flex: i <= step ? 2 : 1,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {steps[step]}
      </ScrollView>

      <View style={styles.buttons}>
        {step > 0 && (
          <Button title="Back" onPress={() => setStep((s) => s - 1)} variant="ghost" style={{ flex: 1 }} />
        )}
        {isLastStep ? (
          <Button
            title="Generate My First Plan"
            onPress={handleComplete}
            loading={loading}
            style={{ flex: step > 0 ? 2 : 1 }}
          />
        ) : (
          <Button title="Continue" onPress={() => setStep((s) => s + 1)} style={{ flex: step > 0 ? 2 : 1 }} />
        )}
      </View>

      {isLastStep && (
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            I'll set this up later
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  progress: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  progressDot: { height: 4, borderRadius: 2 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 160 },
  stepContainer: { gap: Spacing.md },
  stepTitle: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: { fontSize: FontSize.sm, marginBottom: Spacing.sm },

  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  locationNote: { fontSize: FontSize.xs, fontWeight: '500', marginTop: -Spacing.sm },

  // Goal grid (2x2)
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  goalCard: {
    width: '48%',
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
  },
  goalLabel: { fontSize: FontSize.md, fontWeight: '500' },

  // Biometrics
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  halfInput: { flex: 1 },
  unitLabel: { justifyContent: 'flex-end', paddingBottom: 12 },
  unitText: { fontSize: FontSize.sm },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
  },

  // Activity
  activityScroll: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  activityChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  activityText: { fontSize: FontSize.sm, fontWeight: '500' },

  // Chips
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // Buttons
  buttons: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  skipBtn: { alignItems: 'center', paddingBottom: Spacing.xxl },
  skipText: { fontSize: FontSize.sm },
});
