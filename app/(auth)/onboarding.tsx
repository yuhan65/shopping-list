/**
 * Onboarding flow for both nutrition setup and taste preferences.
 * This gives the planner enough context to produce personalized meals on day one.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Input, TagChip } from '@/components/ui';
import { createAIService } from '@/lib/ai';
import {
  calculateBMR,
  calculateTDEE,
  calculateDailyCalories,
  calculateMacros,
  minimumSafeCalories,
} from '@/lib/tdee';
import { profileFromOnboarding } from '@/lib/preferences';
import type {
  HealthObjective,
  CookingEffort,
  SpiceTolerance,
  RepeatTolerance,
  BudgetSensitivity,
} from '@/types/database';

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

const CUISINE_CHIPS = [
  'Chinese',
  'Japanese',
  'Korean',
  'Italian',
  'Mexican',
  'Mediterranean',
  'Indian',
  'Thai',
];

const PROTEIN_CHIPS = ['Chicken', 'Beef', 'Pork', 'Fish', 'Shrimp', 'Tofu', 'Eggs', 'Beans'];
const DISLIKE_CHIPS = ['Mushroom', 'Cilantro', 'Onion', 'Liver', 'Anchovy', 'Raw Tomato', 'Eggplant'];
const EQUIPMENT_CHIPS = ['No Oven', 'No Blender', 'No Air Fryer', 'No Microwave', 'One Pan Only'];
const OTHER_OPTION = 'Other';

type InterpretedTasteProfile = {
  cuisines: string[];
  proteins: string[];
  dislikedIngredients: string[];
  tags: string[];
};

function splitCustomList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUniqueItems(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const normalized = item.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(item.trim());
    }
  }
  return merged;
}

function parseJSONSafely<T>(text: string): T {
  const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as T;
    }
    throw new Error('Invalid JSON from AI response.');
  }
}

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
  const [preferredCuisines, setPreferredCuisines] = useState<string[]>([]);
  const [favoriteProteins, setFavoriteProteins] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>([]);
  const [useOtherCuisine, setUseOtherCuisine] = useState(false);
  const [useOtherProtein, setUseOtherProtein] = useState(false);
  const [useOtherDislike, setUseOtherDislike] = useState(false);
  const [otherCuisineInput, setOtherCuisineInput] = useState('');
  const [otherProteinInput, setOtherProteinInput] = useState('');
  const [otherDislikeInput, setOtherDislikeInput] = useState('');
  const [spiceTolerance, setSpiceTolerance] = useState<SpiceTolerance>('medium');
  const [cookingEffort, setCookingEffort] = useState<CookingEffort>('medium');
  const [prepTimePreferenceMinutes, setPrepTimePreferenceMinutes] = useState('30');
  const [weekdayCookingTime, setWeekdayCookingTime] = useState('quick');
  const [repeatTolerance, setRepeatTolerance] = useState<RepeatTolerance>('medium');
  const [budgetSensitivity, setBudgetSensitivity] = useState<BudgetSensitivity>('medium');
  const [equipmentConstraints, setEquipmentConstraints] = useState<string[]>([]);

  function toggleDiet(d: string) {
    setDietaryPrefs((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function toggleString(setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) {
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }
  function toggleObjective(key: HealthObjective) {
    setHealthObjectives((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  async function interpretCustomTasteInputs(input: {
    cuisines: string[];
    proteins: string[];
    dislikes: string[];
  }): Promise<InterpretedTasteProfile> {
    const hasCustomInputs =
      input.cuisines.length > 0 || input.proteins.length > 0 || input.dislikes.length > 0;
    if (!hasCustomInputs) {
      return { cuisines: [], proteins: [], dislikedIngredients: [], tags: [] };
    }

    try {
      const ai = createAIService();
      const response = await ai.chat([
        {
          role: 'system',
          content:
            'You normalize taste profile notes into structured categories. Return strict JSON only with keys cuisines, proteins, dislikedIngredients, tags. Each value must be a string array. Keep entries short and practical.',
        },
        {
          role: 'user',
          content: `Normalize these custom onboarding inputs:
- favorite cuisines: ${input.cuisines.join(', ') || 'none'}
- favorite proteins: ${input.proteins.join(', ') || 'none'}
- disliked ingredients: ${input.dislikes.join(', ') || 'none'}

Rules:
1) Keep cuisine names as common labels (e.g., "Vietnamese", "Middle Eastern").
2) Keep proteins as ingredient names (e.g., "Lamb", "Tempeh", "Salmon").
3) Keep dislikes as ingredient names.
4) Add useful dietary tags in "tags" when implied (e.g., "high protein", "plant based", "gluten-free").
5) Do not invent preferences that are not implied.`,
        },
      ]);

      const parsed = parseJSONSafely<Partial<InterpretedTasteProfile>>(response);
      return {
        cuisines: Array.isArray(parsed.cuisines) ? parsed.cuisines.filter(Boolean) : [],
        proteins: Array.isArray(parsed.proteins) ? parsed.proteins.filter(Boolean) : [],
        dislikedIngredients: Array.isArray(parsed.dislikedIngredients)
          ? parsed.dislikedIngredients.filter(Boolean)
          : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [],
      };
    } catch (err) {
      console.warn('[Onboarding] AI taste parsing failed, using raw custom values.', err);
      return {
        cuisines: input.cuisines,
        proteins: input.proteins,
        dislikedIngredients: input.dislikes,
        tags: [],
      };
    }
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
      const customCuisines = splitCustomList(otherCuisineInput);
      const customProteins = splitCustomList(otherProteinInput);
      const customDislikes = splitCustomList(otherDislikeInput);
      const interpretedTaste = await interpretCustomTasteInputs({
        cuisines: customCuisines,
        proteins: customProteins,
        dislikes: customDislikes,
      });
      const finalPreferredCuisines = mergeUniqueItems(
        preferredCuisines,
        customCuisines,
        interpretedTaste.cuisines
      );
      const finalFavoriteProteins = mergeUniqueItems(
        favoriteProteins,
        customProteins,
        interpretedTaste.proteins
      );
      const finalDislikedIngredients = mergeUniqueItems(
        dislikedIngredients,
        customDislikes,
        interpretedTaste.dislikedIngredients
      );
      const finalDietaryPrefs = mergeUniqueItems(dietaryPrefs, interpretedTaste.tags);

      const weight = parseFloat(weightKg) || 70;
      const height = parseFloat(heightCm) || 170;
      const ageNum = parseInt(age, 10) || 25;
      const goalType = getGoalType();

      const bmr = calculateBMR({ weightKg: weight, heightCm: height, ageYears: ageNum, sex });
      const tdee = calculateTDEE(bmr, activityLevel);
      const dailyCalories = calculateDailyCalories(tdee, goalType, sex);
      const macros = calculateMacros(dailyCalories, goalType, weight);
      const minCalories = minimumSafeCalories(sex);
      const usedSafetyFloor = dailyCalories === minCalories;

      if (isDemoMode) {
        localUpsert('profiles', {
          user_id: user.id,
          display_name: 'Demo User',
          height_cm: height,
          measurement_system: 'imperial',
          activity_level: activityLevel,
          dietary_restrictions: finalDietaryPrefs,
          health_objectives: healthObjectives,
          preferred_cuisines: finalPreferredCuisines,
          disliked_ingredients: finalDislikedIngredients,
          favorite_proteins: finalFavoriteProteins,
          cooking_effort: cookingEffort,
          prep_time_preference_minutes: parseInt(prepTimePreferenceMinutes, 10) || 30,
          weekday_cooking_time: weekdayCookingTime,
          spice_tolerance: spiceTolerance,
          repeat_tolerance: repeatTolerance,
          budget_sensitivity: budgetSensitivity,
          equipment_constraints: equipmentConstraints,
          location: location.trim() || null,
          household_size: 1,
          sex,
          age_years: ageNum,
        });
        localUpsert('user_taste_profiles', {
          user_id: user.id,
          ingredient_scores: {},
          cuisine_scores: Object.fromEntries(
            finalPreferredCuisines.map((cuisine) => [cuisine.toLowerCase(), 2.5])
          ),
          tag_scores: Object.fromEntries(finalDietaryPrefs.map((tag) => [tag.toLowerCase(), 1.5])),
          ...profileFromOnboarding({ cookingEffort, spiceTolerance, repeatTolerance }),
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
        finalPreferredCuisines.forEach((cuisine) =>
          localInsert('user_preference_signals', {
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'cuisine',
            entity_key: cuisine.toLowerCase(),
            weight: 1.5,
            metadata: { source: 'onboarding' },
          })
        );
        finalFavoriteProteins.forEach((protein) =>
          localInsert('user_preference_signals', {
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'ingredient',
            entity_key: protein.toLowerCase(),
            weight: 1.3,
            metadata: { source: 'onboarding' },
          })
        );
        finalDislikedIngredients.forEach((ingredient) =>
          localInsert('user_preference_signals', {
            user_id: user.id,
            signal_type: 'recipe_dislike',
            entity_type: 'ingredient',
            entity_key: ingredient.toLowerCase(),
            weight: 1.8,
            metadata: { source: 'onboarding' },
          })
        );
        interpretedTaste.tags.forEach((tag) =>
          localInsert('user_preference_signals', {
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'tag',
            entity_key: tag.toLowerCase(),
            weight: 1.1,
            metadata: { source: 'onboarding_ai' },
          })
        );
      } else {
        const { error: profileError } = await supabase.from('profiles').upsert({
          user_id: user.id,
          display_name: null,
          height_cm: height,
          measurement_system: 'imperial',
          activity_level: activityLevel,
          dietary_restrictions: finalDietaryPrefs,
          health_objectives: healthObjectives,
          preferred_cuisines: finalPreferredCuisines,
          disliked_ingredients: finalDislikedIngredients,
          favorite_proteins: finalFavoriteProteins,
          cooking_effort: cookingEffort,
          prep_time_preference_minutes: parseInt(prepTimePreferenceMinutes, 10) || 30,
          weekday_cooking_time: weekdayCookingTime,
          spice_tolerance: spiceTolerance,
          repeat_tolerance: repeatTolerance,
          budget_sensitivity: budgetSensitivity,
          equipment_constraints: equipmentConstraints,
          location: location.trim() || null,
          household_size: 1,
          sex,
          age_years: ageNum,
        });
        if (profileError) throw profileError;
        const { error: tasteError } = await supabase.from('user_taste_profiles').upsert({
          user_id: user.id,
          ingredient_scores: {},
          cuisine_scores: Object.fromEntries(
            finalPreferredCuisines.map((cuisine) => [cuisine.toLowerCase(), 2.5])
          ),
          tag_scores: Object.fromEntries(finalDietaryPrefs.map((tag) => [tag.toLowerCase(), 1.5])),
          ...profileFromOnboarding({ cookingEffort, spiceTolerance, repeatTolerance }),
        });
        if (tasteError) throw tasteError;

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

        const onboardingSignals = [
          ...finalPreferredCuisines.map((cuisine) => ({
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'cuisine',
            entity_key: cuisine.toLowerCase(),
            weight: 1.5,
            metadata: { source: 'onboarding' },
          })),
          ...finalFavoriteProteins.map((protein) => ({
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'ingredient',
            entity_key: protein.toLowerCase(),
            weight: 1.3,
            metadata: { source: 'onboarding' },
          })),
          ...finalDislikedIngredients.map((ingredient) => ({
            user_id: user.id,
            signal_type: 'recipe_dislike',
            entity_type: 'ingredient',
            entity_key: ingredient.toLowerCase(),
            weight: 1.8,
            metadata: { source: 'onboarding' },
          })),
          ...interpretedTaste.tags.map((tag) => ({
            user_id: user.id,
            signal_type: 'onboarding_like',
            entity_type: 'tag',
            entity_key: tag.toLowerCase(),
            weight: 1.1,
            metadata: { source: 'onboarding_ai' },
          })),
        ];
        if (onboardingSignals.length > 0) {
          const { error: signalError } = await supabase
            .from('user_preference_signals')
            .insert(onboardingSignals);
          if (signalError) throw signalError;
        }
      }

      await queryClient.invalidateQueries();
      setIsOnboarded(true);
      if (usedSafetyFloor) {
        Alert.alert(
          'Safety guardrail applied',
          `Your calculated target was very low, so we set a safe minimum of ${minCalories} kcal/day for planning.`
        );
      }
      // After onboarding, jump straight into first-plan generation.
      router.replace('/meal-plan?autogenerate=1');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    setIsOnboarded(true);
    router.replace('/(tabs)/plan');
  }

  const steps = [
    // Step 0: Culinary Context
    <View key="context" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        Set your table.
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
      <Text style={[styles.stepTitle, { color: colors.text }]}>Build your body blueprint.</Text>
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
        Choose your nutrition priorities.
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

    // Step 3: Taste profile
    <View key="taste" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>Curate your taste signature.</Text>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>FAVORITE CUISINES</Text>
      <View style={styles.chipContainer}>
        {CUISINE_CHIPS.map((cuisine) => (
          <TagChip
            key={cuisine}
            label={cuisine}
            selected={preferredCuisines.includes(cuisine)}
            onPress={() => toggleString(setPreferredCuisines, cuisine)}
            selectedColor={colors.text}
            selectedTextColor={colors.background}
            defaultColor={colors.surfaceSecondary}
            defaultTextColor={colors.text}
          />
        ))}
        <TagChip
          label={OTHER_OPTION}
          selected={useOtherCuisine}
          onPress={() => {
            setUseOtherCuisine((prev) => {
              if (prev) setOtherCuisineInput('');
              return !prev;
            });
          }}
          selectedColor={colors.text}
          selectedTextColor={colors.background}
          defaultColor={colors.surfaceSecondary}
          defaultTextColor={colors.text}
        />
      </View>
      {useOtherCuisine && (
        <Input
          value={otherCuisineInput}
          onChangeText={setOtherCuisineInput}
          placeholder="e.g. Persian, Ethiopian"
        />
      )}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        FAVORITE PROTEINS
      </Text>
      <View style={styles.chipContainer}>
        {PROTEIN_CHIPS.map((protein) => (
          <TagChip
            key={protein}
            label={protein}
            selected={favoriteProteins.includes(protein)}
            onPress={() => toggleString(setFavoriteProteins, protein)}
            selectedColor={colors.text}
            selectedTextColor={colors.background}
            defaultColor={colors.surfaceSecondary}
            defaultTextColor={colors.text}
          />
        ))}
        <TagChip
          label={OTHER_OPTION}
          selected={useOtherProtein}
          onPress={() => {
            setUseOtherProtein((prev) => {
              if (prev) setOtherProteinInput('');
              return !prev;
            });
          }}
          selectedColor={colors.text}
          selectedTextColor={colors.background}
          defaultColor={colors.surfaceSecondary}
          defaultTextColor={colors.text}
        />
      </View>
      {useOtherProtein && (
        <Input
          value={otherProteinInput}
          onChangeText={setOtherProteinInput}
          placeholder="e.g. Lamb, Turkey"
        />
      )}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        INGREDIENTS YOU DISLIKE
      </Text>
      <View style={styles.chipContainer}>
        {DISLIKE_CHIPS.map((ingredient) => (
          <TagChip
            key={ingredient}
            label={ingredient}
            selected={dislikedIngredients.includes(ingredient)}
            onPress={() => toggleString(setDislikedIngredients, ingredient)}
            selectedColor={colors.text}
            selectedTextColor={colors.background}
            defaultColor={colors.surfaceSecondary}
            defaultTextColor={colors.text}
          />
        ))}
        <TagChip
          label={OTHER_OPTION}
          selected={useOtherDislike}
          onPress={() => {
            setUseOtherDislike((prev) => {
              if (prev) setOtherDislikeInput('');
              return !prev;
            });
          }}
          selectedColor={colors.text}
          selectedTextColor={colors.background}
          defaultColor={colors.surfaceSecondary}
          defaultTextColor={colors.text}
        />
      </View>
      {useOtherDislike && (
        <Input
          value={otherDislikeInput}
          onChangeText={setOtherDislikeInput}
          placeholder="e.g. Blue cheese, olives"
        />
      )}
    </View>,

    // Step 4: Cooking style
    <View key="style" style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>Shape your kitchen rhythm.</Text>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>COOKING EFFORT</Text>
      <View style={styles.goalGrid}>
        {[
          { value: 'low', label: 'Low Effort' },
          { value: 'medium', label: 'Balanced' },
          { value: 'high', label: 'High Effort' },
        ].map((effort) => (
          <TouchableOpacity
            key={effort.value}
            onPress={() => setCookingEffort(effort.value as CookingEffort)}
            style={[
              styles.goalCard,
              {
                borderColor: cookingEffort === effort.value ? colors.text : colors.border,
                backgroundColor: cookingEffort === effort.value ? colors.tintLight : colors.surface,
                width: '31%',
              },
            ]}
          >
            <Text
              style={[
                styles.goalLabel,
                { color: cookingEffort === effort.value ? colors.text : colors.textSecondary },
              ]}
            >
              {effort.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        TARGET PREP TIME (MIN)
      </Text>
      <Input
        value={prepTimePreferenceMinutes}
        onChangeText={setPrepTimePreferenceMinutes}
        keyboardType="numeric"
        placeholder="30"
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        SPICE TOLERANCE
      </Text>
      <View style={styles.segmentRow}>
        {(['mild', 'medium', 'hot'] as SpiceTolerance[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSpiceTolerance(s)}
            style={[
              styles.segment,
              {
                backgroundColor: spiceTolerance === s ? colors.tint : colors.surfaceSecondary,
                borderColor: spiceTolerance === s ? colors.tint : colors.border,
              },
            ]}
          >
            <Text style={{ color: spiceTolerance === s ? '#FFF' : colors.text, fontWeight: '500' }}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        REPEAT TOLERANCE
      </Text>
      <View style={styles.segmentRow}>
        {(['low', 'medium', 'high'] as RepeatTolerance[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setRepeatTolerance(s)}
            style={[
              styles.segment,
              {
                backgroundColor: repeatTolerance === s ? colors.tint : colors.surfaceSecondary,
                borderColor: repeatTolerance === s ? colors.tint : colors.border,
              },
            ]}
          >
            <Text style={{ color: repeatTolerance === s ? '#FFF' : colors.text, fontWeight: '500' }}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        WEEKDAY COOKING TIME
      </Text>
      <View style={styles.segmentRow}>
        {[
          { value: 'quick', label: 'Quick' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'long', label: 'Long' },
        ].map((s) => (
          <TouchableOpacity
            key={s.value}
            onPress={() => setWeekdayCookingTime(s.value)}
            style={[
              styles.segment,
              {
                backgroundColor: weekdayCookingTime === s.value ? colors.tint : colors.surfaceSecondary,
                borderColor: weekdayCookingTime === s.value ? colors.tint : colors.border,
              },
            ]}
          >
            <Text style={{ color: weekdayCookingTime === s.value ? '#FFF' : colors.text, fontWeight: '500' }}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        BUDGET SENSITIVITY
      </Text>
      <View style={styles.segmentRow}>
        {(['low', 'medium', 'high'] as BudgetSensitivity[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setBudgetSensitivity(s)}
            style={[
              styles.segment,
              {
                backgroundColor: budgetSensitivity === s ? colors.tint : colors.surfaceSecondary,
                borderColor: budgetSensitivity === s ? colors.tint : colors.border,
              },
            ]}
          >
            <Text style={{ color: budgetSensitivity === s ? '#FFF' : colors.text, fontWeight: '500' }}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
        EQUIPMENT LIMITS (OPTIONAL)
      </Text>
      <View style={styles.chipContainer}>
        {EQUIPMENT_CHIPS.map((equipment) => (
          <TagChip
            key={equipment}
            label={equipment}
            selected={equipmentConstraints.includes(equipment)}
            onPress={() => toggleString(setEquipmentConstraints, equipment)}
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
                flex: 1,
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
