/**
 * Weekly meal-plan screen that generates plans, shows each day/meal, and lets users save AI meal drafts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Card, EmptyState, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { mealTitle } from '@/lib/mealTitle';
import { createAIService } from '@/lib/ai';
import { minimumSafeCalories } from '@/lib/tdee';
import { buildTasteProfileFromSignals, scoreRecipeWithPreferences } from '@/lib/preferences';
import { useMealPlanGenerationStore } from '@/stores/mealPlanGenerationStore';
import { useQueryClient } from '@tanstack/react-query';
import {
  shouldSkipItem,
  convertToShoppableUnit,
  roundForShopping,
  classifyIngredient,
} from '@/lib/shoppingHelpers';
import type {
  Recipe,
  MealPlan,
  MealPlanItem,
  BodyGoal,
  Ingredient,
  PantryItem,
  Profile,
  GeneratedRecipeDraft,
  MealFeedback,
  UserPreferenceSignal,
  UserTasteProfile,
} from '@/types/database';

const DAYS: { key: string; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const MEAL_SLOT_ORDER: MealPlanItem['meal_type'][] = ['breakfast', 'lunch', 'dinner', 'snack'];

function fallbackCaloriesForMeal(mealType: MealPlanItem['meal_type'], dailyCalories: number): number {
  const target = Math.max(500, dailyCalories || 0);
  const ratioByMeal: Record<MealPlanItem['meal_type'], number> = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.3,
    snack: 0.1,
  };
  return Math.max(40, Math.round(target * ratioByMeal[mealType]));
}

function createFallbackGeneratedRecipe(params: {
  mealType: MealPlanItem['meal_type'];
  dailyCalories: number;
}): GeneratedRecipeDraft {
  const isVeryLowCalorie = params.dailyCalories < 900;
  const targetCalories = fallbackCaloriesForMeal(params.mealType, params.dailyCalories);

  if (isVeryLowCalorie) {
    if (params.mealType === 'breakfast') {
      return {
        title: 'Banana and Tea',
        description: 'Very light breakfast used as a fallback when matching meals are unavailable.',
        ingredients: [
          { name: 'banana', quantity: 1, unit: 'piece', category: 'produce' },
          { name: 'unsweetened tea', quantity: 1, unit: 'cup', category: 'beverages' },
        ],
        instructions: ['Peel and eat the banana.', 'Brew and drink unsweetened tea.'],
        servings: 1,
        prep_time_minutes: 2,
        cook_time_minutes: 0,
        calories_per_serving: targetCalories,
        protein_per_serving: 1,
        carbs_per_serving: 30,
        fat_per_serving: 0,
        tags: ['fallback', 'very-low-calorie'],
      };
    }
    if (params.mealType === 'lunch') {
      return {
        title: 'Quick Vegetable Soup',
        description: 'Simple fallback lunch for strict calorie targets.',
        ingredients: [
          { name: 'vegetable broth', quantity: 2, unit: 'cup', category: 'canned' },
          { name: 'mixed vegetables', quantity: 1, unit: 'cup', category: 'produce' },
        ],
        instructions: ['Bring broth to a simmer.', 'Add vegetables and cook for 8-10 minutes.'],
        servings: 1,
        prep_time_minutes: 5,
        cook_time_minutes: 10,
        calories_per_serving: targetCalories,
        protein_per_serving: 5,
        carbs_per_serving: 24,
        fat_per_serving: 3,
        tags: ['fallback', 'very-low-calorie'],
      };
    }
    if (params.mealType === 'dinner') {
      return {
        title: 'Light Evening Option (Optional Skip)',
        description: 'Fallback dinner placeholder when no strict-calorie match exists.',
        ingredients: [{ name: 'herbal tea', quantity: 1, unit: 'cup', category: 'beverages' }],
        instructions: [
          'Prepare warm herbal tea.',
          'If not hungry, you can skip this meal and hydrate instead.',
        ],
        servings: 1,
        prep_time_minutes: 2,
        cook_time_minutes: 0,
        calories_per_serving: Math.min(30, targetCalories),
        protein_per_serving: 0,
        carbs_per_serving: 1,
        fat_per_serving: 0,
        tags: ['fallback', 'optional-meal'],
      };
    }
    return {
      title: 'Cucumber Snack Cup',
      description: 'Very light snack fallback.',
      ingredients: [{ name: 'cucumber', quantity: 0.5, unit: 'piece', category: 'produce' }],
      instructions: ['Slice cucumber and enjoy as a fresh snack.'],
      servings: 1,
      prep_time_minutes: 3,
      cook_time_minutes: 0,
      calories_per_serving: targetCalories,
      protein_per_serving: 1,
      carbs_per_serving: 4,
      fat_per_serving: 0,
      tags: ['fallback', 'very-low-calorie'],
    };
  }

  if (params.mealType === 'breakfast') {
    return {
      title: 'Greek Yogurt and Berries',
      description: 'Simple backup breakfast when no exact recipe match is available.',
      ingredients: [
        { name: 'plain greek yogurt', quantity: 0.75, unit: 'cup', category: 'dairy' },
        { name: 'mixed berries', quantity: 0.5, unit: 'cup', category: 'produce' },
      ],
      instructions: ['Add yogurt to a bowl.', 'Top with berries and serve.'],
      servings: 1,
      prep_time_minutes: 3,
      cook_time_minutes: 0,
      calories_per_serving: targetCalories,
      protein_per_serving: 20,
      carbs_per_serving: 18,
      fat_per_serving: 6,
      tags: ['fallback', 'high-protein'],
    };
  }
  if (params.mealType === 'lunch') {
    return {
      title: 'Egg and Veggie Scramble',
      description: 'Fast fallback lunch with balanced macros.',
      ingredients: [
        { name: 'eggs', quantity: 2, unit: 'piece', category: 'dairy' },
        { name: 'spinach', quantity: 1, unit: 'cup', category: 'produce' },
        { name: 'olive oil', quantity: 1, unit: 'tbsp', category: 'condiments' },
      ],
      instructions: ['Heat olive oil in a pan.', 'Cook spinach briefly, then scramble in eggs until set.'],
      servings: 1,
      prep_time_minutes: 5,
      cook_time_minutes: 8,
      calories_per_serving: targetCalories,
      protein_per_serving: 19,
      carbs_per_serving: 6,
      fat_per_serving: 22,
      tags: ['fallback', 'balanced'],
    };
  }
  if (params.mealType === 'dinner') {
    return {
      title: 'Chicken and Steamed Vegetables',
      description: 'Simple fallback dinner with easy prep.',
      ingredients: [
        { name: 'chicken breast', quantity: 120, unit: 'g', category: 'meat' },
        { name: 'broccoli', quantity: 1.5, unit: 'cup', category: 'produce' },
      ],
      instructions: ['Pan-sear chicken until fully cooked.', 'Steam broccoli and serve together.'],
      servings: 1,
      prep_time_minutes: 8,
      cook_time_minutes: 15,
      calories_per_serving: targetCalories,
      protein_per_serving: 32,
      carbs_per_serving: 10,
      fat_per_serving: 10,
      tags: ['fallback', 'high-protein'],
    };
  }
  return {
    title: 'Banana with Peanut Butter',
    description: 'Quick fallback snack.',
    ingredients: [
      { name: 'banana', quantity: 1, unit: 'piece', category: 'produce' },
      { name: 'peanut butter', quantity: 1, unit: 'tbsp', category: 'condiments' },
    ],
    instructions: ['Slice banana and top with peanut butter.'],
    servings: 1,
    prep_time_minutes: 2,
    cook_time_minutes: 0,
    calories_per_serving: targetCalories,
    protein_per_serving: 5,
    carbs_per_serving: 30,
    fat_per_serving: 8,
    tags: ['fallback', 'quick-snack'],
  };
}

export default function MealPlanScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ autogenerate?: string }>();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localUpdate = useLocalDataStore((s) => s.update);
  const localQuery = useLocalDataStore((s) => s.query);
  const setPreviewDraft = useRecipePreviewStore((s) => s.setDraft);
  const queryClient = useQueryClient();
  const startGeneration = useMealPlanGenerationStore((s) => s.startGeneration);
  const setGenerationPhase = useMealPlanGenerationStore((s) => s.setPhase);
  const completeGeneration = useMealPlanGenerationStore((s) => s.completeGeneration);
  const failGeneration = useMealPlanGenerationStore((s) => s.failGeneration);

  const [generating, setGenerating] = useState(false);
  const [generatingList, setGeneratingList] = useState(false);
  const [savingMealItemId, setSavingMealItemId] = useState<string | null>(null);
  const [feedbackLoadingId, setFeedbackLoadingId] = useState<string | null>(null);
  const hasAutoGeneratedRef = useRef(false);

  const { data: recipes } = useSupabaseQuery<Recipe>(['recipes'], 'recipes', {
    filter: { user_id: user?.id },
  });

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: profiles } = useSupabaseQuery<Profile>(['profile'], 'profiles', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const profile = profiles?.[0];

  const { data: pantryItems } = useSupabaseQuery<PantryItem>(['pantry_items'], 'pantry_items', {
    filter: { user_id: user?.id },
  });

  const { data: plans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = plans?.[0];

  const { data: planItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  const { data: preferenceSignals } = useSupabaseQuery<UserPreferenceSignal>(
    ['user_preference_signals'],
    'user_preference_signals',
    {
      filter: { user_id: user?.id },
      orderBy: { column: 'created_at', ascending: false },
      limit: 300,
    }
  );

  const { data: tasteProfiles } = useSupabaseQuery<UserTasteProfile>(
    ['user_taste_profiles'],
    'user_taste_profiles',
    {
      filter: { user_id: user?.id },
      limit: 1,
    }
  );
  const tasteProfile = tasteProfiles?.[0];

  function normalizeGeneratedRecipe(value: unknown): GeneratedRecipeDraft | null {
    if (!value || typeof value !== 'object') return null;
    const recipe = value as any;
    if (typeof recipe.title !== 'string' || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.instructions)) {
      return null;
    }

    return {
      title: recipe.title,
      description: typeof recipe.description === 'string' ? recipe.description : null,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      servings: typeof recipe.servings === 'number' ? recipe.servings : 1,
      prep_time_minutes: typeof recipe.prep_time_minutes === 'number' ? recipe.prep_time_minutes : null,
      cook_time_minutes: typeof recipe.cook_time_minutes === 'number' ? recipe.cook_time_minutes : null,
      calories_per_serving: typeof recipe.calories_per_serving === 'number' ? recipe.calories_per_serving : null,
      protein_per_serving: typeof recipe.protein_per_serving === 'number' ? recipe.protein_per_serving : null,
      carbs_per_serving: typeof recipe.carbs_per_serving === 'number' ? recipe.carbs_per_serving : null,
      fat_per_serving: typeof recipe.fat_per_serving === 'number' ? recipe.fat_per_serving : null,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    };
  }

  async function logPreferenceFeedback(params: {
    mealItem: MealPlanItem;
    feedbackType: MealFeedback['feedback_type'];
    reason?: string;
  }) {
    if (!user) return;
    setFeedbackLoadingId(params.mealItem.id);

    const recipe = params.mealItem.recipe as unknown as Recipe | undefined;
    const generated = params.mealItem.generated_recipe;
    const title = recipe?.title || generated?.title || params.mealItem.generated_title || 'meal';
    const topTags = (recipe?.tags || generated?.tags || []).slice(0, 3);
    const ingredientNames = (recipe?.ingredients || generated?.ingredients || [])
      .slice(0, 4)
      .map((x) => x.name.toLowerCase());

    const signalRows: Record<string, unknown>[] = [
      {
        user_id: user.id,
        signal_type:
          params.feedbackType === 'liked' || params.feedbackType === 'cooked'
            ? 'recipe_like'
            : params.feedbackType === 'skipped'
              ? 'meal_skipped'
              : params.feedbackType === 'swapped'
                ? 'meal_swapped_out'
                : 'recipe_dislike',
        entity_type: 'meal_plan_item',
        entity_key: params.mealItem.id,
        weight: 1,
        metadata: { reason: params.reason || null, meal_type: params.mealItem.meal_type },
      },
      {
        user_id: user.id,
        signal_type:
          params.feedbackType === 'liked' || params.feedbackType === 'cooked'
            ? 'recipe_like'
            : params.feedbackType === 'skipped'
              ? 'meal_skipped'
              : params.feedbackType === 'swapped'
                ? 'meal_swapped_out'
                : 'recipe_dislike',
        entity_type: 'recipe',
        entity_key: recipe?.id || title.toLowerCase(),
        weight: 1,
        metadata: { reason: params.reason || null, source_type: params.mealItem.source_type },
      },
      ...topTags.map((tag) => ({
        user_id: user.id,
        signal_type:
          params.feedbackType === 'liked' || params.feedbackType === 'cooked'
            ? 'recipe_like'
            : 'recipe_dislike',
        entity_type: 'tag',
        entity_key: String(tag).toLowerCase(),
        weight: 0.7,
        metadata: { reason: params.reason || null },
      })),
      ...ingredientNames.map((name) => ({
        user_id: user.id,
        signal_type:
          params.feedbackType === 'liked' || params.feedbackType === 'cooked'
            ? 'recipe_like'
            : 'recipe_dislike',
        entity_type: 'ingredient',
        entity_key: name,
        weight: 0.5,
        metadata: { reason: params.reason || null },
      })),
    ];

    const mealFeedbackRow: Record<string, unknown> = {
      meal_plan_item_id: params.mealItem.id,
      user_id: user.id,
      feedback_type: params.feedbackType,
      reason: params.reason || null,
    };

    try {
      if (isDemoMode) {
        localInsert('meal_feedback', mealFeedbackRow);
        signalRows.forEach((row) => localInsert('user_preference_signals', row));
      } else {
        const { error: feedbackError } = await supabase.from('meal_feedback').insert(mealFeedbackRow);
        if (feedbackError) throw feedbackError;
        const { error: signalError } = await supabase.from('user_preference_signals').insert(signalRows);
        if (signalError) throw signalError;
      }

      queryClient.invalidateQueries({ queryKey: ['meal_feedback'] });
      queryClient.invalidateQueries({ queryKey: ['user_preference_signals'] });
      await syncTasteProfileSnapshot();
      Alert.alert('Saved', 'Preference feedback recorded.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save feedback.');
    } finally {
      setFeedbackLoadingId(null);
    }
  }

  async function syncTasteProfileSnapshot() {
    if (!user) return;
    const mergedSignals = preferenceSignals || [];
    const scores = buildTasteProfileFromSignals(mergedSignals, tasteProfile);
    const snapshotRow = {
      user_id: user.id,
      ingredient_scores: scores.ingredient_scores,
      cuisine_scores: scores.cuisine_scores,
      tag_scores: scores.tag_scores,
      effort_preference: profile?.cooking_effort || 'medium',
      spice_preference: profile?.spice_tolerance || 'medium',
      variety_preference: profile?.repeat_tolerance || 'medium',
    };
    if (isDemoMode) {
      useLocalDataStore.getState().upsert('user_taste_profiles', snapshotRow);
      return;
    }
    await supabase.from('user_taste_profiles').upsert(snapshotRow);
    queryClient.invalidateQueries({ queryKey: ['user_taste_profiles'] });
  }

  async function generateMealPlan() {
    if (!goal) {
      Alert.alert('No Goals', 'Please set your body goals in your profile first.');
      return;
    }

    // Navigate to the animated loading screen
    router.push('/meal-plan/generating' as any);

    startGeneration();
    setGenerating(true);
    try {
      setGenerationPhase('reading_profile');
      const planningDailyCalories = Math.max(goal.daily_calories, minimumSafeCalories());
      const ai = createAIService();
      const pantryNames = (pantryItems || []).map((item) => item.name);
      const dietaryPreferences = profile?.dietary_restrictions || [];
      const computedTaste = buildTasteProfileFromSignals(preferenceSignals || [], tasteProfile);
      const effectiveTasteProfile = tasteProfile
        ? { ...tasteProfile, ...computedTaste }
        : {
            ingredient_scores: computedTaste.ingredient_scores,
            cuisine_scores: computedTaste.cuisine_scores,
            tag_scores: computedTaste.tag_scores,
          };
      setGenerationPhase('matching_preferences');
      const rankedRecipes = recipes
        .map((r) => ({
          id: r.id,
          title: r.title,
          calories: r.calories_per_serving,
          protein: r.protein_per_serving,
          carbs: r.carbs_per_serving,
          fat: r.fat_per_serving,
          tags: r.tags || [],
          priority_score: scoreRecipeWithPreferences(r, {
            pantryNames,
            dietaryTags: [...dietaryPreferences, ...(profile?.preferred_cuisines || [])],
            tasteProfile: effectiveTasteProfile,
            effortPreference: profile?.cooking_effort || 'medium',
            prepTimePreferenceMinutes: profile?.prep_time_preference_minutes || 30,
          }),
        }))
        .sort((a, b) => b.priority_score - a.priority_score);

      setGenerationPhase('generating_weekly_meals');
      const result = await ai.generateMealPlan({
        recipes: rankedRecipes,
        dailyCalories: planningDailyCalories,
        proteinG: goal.protein_g,
        carbsG: goal.carbs_g,
        fatG: goal.fat_g,
        dietaryRestrictions: profile?.dietary_restrictions || [],
        dietaryPreferences,
        preferredCuisines: profile?.preferred_cuisines || [],
        dislikedIngredients: profile?.disliked_ingredients || [],
        favoriteProteins: profile?.favorite_proteins || [],
        cookingEffort: profile?.cooking_effort || 'medium',
        prepTimeTargetMinutes: profile?.prep_time_preference_minutes || 30,
        spiceTolerance: profile?.spice_tolerance || 'medium',
        repeatTolerance: profile?.repeat_tolerance || 'medium',
        budgetSensitivity: profile?.budget_sensitivity || 'medium',
        pantryIngredients: pantryNames,
        daysToGenerate: 7,
      });

      setGenerationPhase('saving_plan');
      if (activePlan) {
        if (isDemoMode) {
          localUpdate('meal_plans', activePlan.id, { status: 'completed' });
        } else {
          await supabase
            .from('meal_plans')
            .update({ status: 'completed' })
            .eq('id', activePlan.id);
        }
      }

      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().split('T')[0];

      let newPlanId: string;

      if (isDemoMode) {
        newPlanId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localInsert('meal_plans', {
          id: newPlanId,
          user_id: user!.id,
          week_start_date: weekStart,
          status: 'active',
        });
      } else {
        const { data: newPlan, error: planError } = await supabase
          .from('meal_plans')
          .insert({
            user_id: user!.id,
            week_start_date: weekStart,
            status: 'active',
          })
          .select()
          .single();
        if (planError) throw planError;
        newPlanId = newPlan.id;
      }

      const validRecipeIds = new Set((recipes || []).map((r) => r.id));
      const normalizedDays = DAYS.map((d) => d.key);

      const items = normalizedDays.flatMap((dayKey) => {
        const dayBlock = result.days.find((d) => d.day === dayKey);
        const mealsByType = new Map<string, any>();
        for (const meal of dayBlock?.meals || []) {
          if (!meal || typeof meal !== 'object') continue;
          if (typeof meal.meal_type !== 'string') continue;
          if (!mealsByType.has(meal.meal_type)) {
            mealsByType.set(meal.meal_type, meal);
          }
        }

        return MEAL_SLOT_ORDER.map((mealType): Record<string, unknown> => {
          const meal = mealsByType.get(mealType);
          const servings =
            typeof meal?.servings === 'number' && meal.servings > 0 ? Math.round(meal.servings) : 1;

          if (
            meal?.source_type === 'db' &&
            typeof meal.recipe_id === 'string' &&
            validRecipeIds.has(meal.recipe_id)
          ) {
            return {
              meal_plan_id: newPlanId,
              recipe_id: meal.recipe_id,
              source_type: 'db',
              generated_recipe: null,
              generated_title: null,
              day_of_week: dayKey,
              meal_type: mealType,
              servings,
            };
          }

          if (meal?.source_type === 'generated') {
            const generatedRecipe = normalizeGeneratedRecipe(meal.generated_recipe);
            if (generatedRecipe) {
              return {
                meal_plan_id: newPlanId,
                recipe_id: null,
                source_type: 'generated',
                generated_recipe: generatedRecipe,
                generated_title: generatedRecipe.title,
                day_of_week: dayKey,
                meal_type: mealType,
                servings,
              };
            }
          }

          const fallbackRecipe = createFallbackGeneratedRecipe({
            mealType,
            dailyCalories: planningDailyCalories,
          });
          return {
            meal_plan_id: newPlanId,
            recipe_id: null,
            source_type: 'generated',
            generated_recipe: fallbackRecipe,
            generated_title: fallbackRecipe.title,
            day_of_week: dayKey,
            meal_type: mealType,
            servings: 1,
          };
        });
      });

      if (isDemoMode) {
        items.forEach((item) => localInsert('meal_plan_items', item));
      } else {
        const { error: itemsError } = await supabase.from('meal_plan_items').insert(items);
        if (itemsError) throw itemsError;
      }

      queryClient.invalidateQueries({ queryKey: ['meal_plans'] });
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items'] });

      completeGeneration();
      Alert.alert('Success', 'Weekly meal plan generated!');
    } catch (err: any) {
      failGeneration(err?.message || 'Could not generate meal plan.');
      Alert.alert('Error', err.message);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (params.autogenerate !== '1') return;
    if (hasAutoGeneratedRef.current) return;
    if (!goal) return;

    hasAutoGeneratedRef.current = true;
    generateMealPlan();
  }, [params.autogenerate, goal]);

  async function saveGeneratedRecipe(item: MealPlanItem) {
    const generatedRecipe = item.generated_recipe;
    if (!generatedRecipe || !user) return;
    setSavingMealItemId(item.id);

    const recipeRow = {
      user_id: user.id,
      title: generatedRecipe.title,
      description: generatedRecipe.description,
      source_url: null,
      source_type: 'ai',
      ingredients: generatedRecipe.ingredients,
      instructions: generatedRecipe.instructions,
      servings: generatedRecipe.servings,
      prep_time_minutes: generatedRecipe.prep_time_minutes,
      cook_time_minutes: generatedRecipe.cook_time_minutes,
      calories_per_serving: generatedRecipe.calories_per_serving,
      protein_per_serving: generatedRecipe.protein_per_serving,
      carbs_per_serving: generatedRecipe.carbs_per_serving,
      fat_per_serving: generatedRecipe.fat_per_serving,
      tags: generatedRecipe.tags,
    };

    try {
      let newRecipeId: string;
      if (isDemoMode) {
        newRecipeId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localInsert('recipes', { ...recipeRow, id: newRecipeId });
        localUpdate('meal_plan_items', item.id, {
          source_type: 'db',
          recipe_id: newRecipeId,
          generated_recipe: null,
          generated_title: null,
        });
      } else {
        const { data, error } = await supabase
          .from('recipes')
          .insert(recipeRow)
          .select()
          .single();
        if (error) throw error;
        newRecipeId = data.id;

        const { error: updateError } = await supabase
          .from('meal_plan_items')
          .update({
            source_type: 'db',
            recipe_id: newRecipeId,
            generated_recipe: null,
            generated_title: null,
          })
          .eq('id', item.id);
        if (updateError) throw updateError;
      }

      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      await queryClient.invalidateQueries({ queryKey: ['meal_plan_items'] });
      Alert.alert('Saved', `"${generatedRecipe.title}" is now in your recipes.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save generated recipe.');
    } finally {
      setSavingMealItemId(null);
    }
  }

  async function generateShoppingList() {
    if (!activePlan || !planItems || planItems.length === 0) return;
    setGeneratingList(true);

    try {
      const normalize = (value: string) => value.trim().toLowerCase();

      // Consolidate ingredients across all meals
      const ingredientMap: Record<
        string,
        { name: string; quantity: number; unit: string; category: string; recipeIds: string[] }
      > = {};

      for (const item of planItems) {
        const recipe = item.recipe as unknown as Recipe;
        const generated = item.generated_recipe;
        const ingredients: Ingredient[] = Array.isArray(recipe?.ingredients)
          ? recipe.ingredients
          : Array.isArray(generated?.ingredients)
            ? generated.ingredients
            : [];
        if (ingredients.length === 0) continue;

        for (const ing of ingredients) {
          // Don't add things like water or ice to the shopping list
          if (shouldSkipItem(ing.name)) continue;

          // Convert impractical units (e.g. 6 cloves garlic → 30 g)
          const rawQty = ing.quantity * item.servings;
          const converted = convertToShoppableUnit(ing.name, rawQty, ing.unit);

          // Use name + converted unit as key so garlic_g consolidates properly
          const key = `${normalize(ing.name)}_${normalize(converted.unit)}`;
          if (ingredientMap[key]) {
            ingredientMap[key].quantity += converted.quantity;
            if (item.recipe_id && !ingredientMap[key].recipeIds.includes(item.recipe_id)) {
              ingredientMap[key].recipeIds.push(item.recipe_id);
            }
          } else {
            ingredientMap[key] = {
              name: ing.name.trim(),
              quantity: converted.quantity,
              unit: converted.unit,
              // Classify by name into a real supermarket section
              category: classifyIngredient(ing.name),
              recipeIds: item.recipe_id ? [item.recipe_id] : [],
            };
          }
        }
      }

      // Pantry is the source of truth for what the user already has.
      // Build a pantry quantity map so shopping list becomes a delta.
      let pantryRows: PantryItem[] = [];
      if (isDemoMode) {
        pantryRows = (localQuery('pantry_items', { user_id: user!.id }) as unknown as PantryItem[]) ?? [];
      } else {
        const { data, error } = await supabase
          .from('pantry_items')
          .select('id,user_id,name,quantity,unit,expiry_date,created_at,updated_at')
          .eq('user_id', user!.id);
        if (error) throw error;
        pantryRows = data ?? [];
      }

      // Convert pantry units too so "5 cloves garlic" in pantry
      // correctly deducts from "garlic_g" in the shopping map.
      const pantryQuantityByKey: Record<string, number> = {};
      for (const pantryItem of pantryRows) {
        const converted = convertToShoppableUnit(
          pantryItem.name,
          Number(pantryItem.quantity || 0),
          pantryItem.unit,
        );
        const key = `${normalize(pantryItem.name)}_${normalize(converted.unit)}`;
        pantryQuantityByKey[key] = (pantryQuantityByKey[key] ?? 0) + converted.quantity;
      }

      const listItems = Object.entries(ingredientMap)
        .map(([_, val]) => {
          const needed = Number(val.quantity || 0);
          const alreadyInPantry = pantryQuantityByKey[
            `${normalize(val.name)}_${normalize(val.unit)}`
          ] ?? 0;
          const remaining = Math.max(0, needed - alreadyInPantry);
          if (remaining <= 0) return null;
          return {
            shopping_list_id: '',
            name: val.name.charAt(0).toUpperCase() + val.name.slice(1),
            quantity: roundForShopping(remaining, val.unit),
            unit: val.unit,
            category: val.category,
            is_purchased: false,
            recipe_source_ids: val.recipeIds,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.quantity > 0);

      if (listItems.length === 0) {
        Alert.alert('Nothing to buy', 'Your pantry already covers this plan. No shopping list was created.');
        return;
      }

      let newListId: string;
      if (isDemoMode) {
        newListId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localInsert('shopping_lists', {
          id: newListId,
          user_id: user!.id,
          meal_plan_id: activePlan.id,
          name: `Shopping List - Week of ${activePlan.week_start_date}`,
          status: 'active',
        });
      } else {
        const { data: newList, error: listError } = await supabase
          .from('shopping_lists')
          .insert({
            user_id: user!.id,
            meal_plan_id: activePlan.id,
            name: `Shopping List - Week of ${activePlan.week_start_date}`,
            status: 'active',
          })
          .select()
          .single();
        if (listError) throw listError;
        newListId = newList.id;
      }

      const itemsWithListId = listItems.map((item) => ({
        ...item,
        shopping_list_id: newListId,
      }));

      if (isDemoMode) {
        itemsWithListId.forEach((item) => localInsert('shopping_list_items', item));
      } else {
        const { error: itemsError } = await supabase.from('shopping_list_items').insert(itemsWithListId);
        if (itemsError) throw itemsError;
      }

      queryClient.invalidateQueries({ queryKey: ['shopping_lists'] });
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items'] });

      Alert.alert('Success', 'Shopping list generated!', [
        { text: 'View List', onPress: () => router.push('/(tabs)/shopping' as any) },
        { text: 'OK' },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingList(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Meal Plan</Text>
        <TouchableOpacity onPress={generateMealPlan} disabled={generating}>
          {generating ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Icon name="arrow-path" size={22} color={colors.tint} />
          )}
        </TouchableOpacity>
      </View>

      {activePlan && planItems && planItems.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.planHeader}>
            <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>
              Week of {activePlan.week_start_date}
            </Text>
            <Button
              title={generatingList ? 'Generating...' : 'Generate Shopping List'}
              onPress={generateShoppingList}
              loading={generatingList}
              size="sm"
              variant="outline"
            />
          </View>

          {DAYS.map(({ key, label }) => {
            const dayMeals = planItems
              .filter((item) => item.day_of_week === key)
              .sort((a, b) => {
                const order = ['breakfast', 'lunch', 'dinner', 'snack'];
                return order.indexOf(a.meal_type) - order.indexOf(b.meal_type);
              });

            if (dayMeals.length === 0) return null;

            return (
              <View key={key} style={styles.daySection}>
                <Text style={[styles.dayTitle, { color: colors.text }]}>{label}</Text>
                {dayMeals.map((meal) => {
                  const recipe = meal.recipe as unknown as Recipe;
                  const generated = meal.generated_recipe;
                  const mealName = recipe?.title || generated?.title || meal.generated_title || 'Generated meal';
                  const caloriesPerServing = recipe?.calories_per_serving ?? generated?.calories_per_serving;
                  return (
                    <Card key={meal.id} style={styles.mealCard}>
                      <TouchableOpacity
                        disabled={!meal.recipe_id && !generated}
                        onPress={() => {
                          if (meal.recipe_id) {
                            router.push(`/recipe/${meal.recipe_id}` as any);
                            return;
                          }
                          if (generated) {
                            setPreviewDraft(
                              {
                                ...generated,
                                description: generated.description ?? '',
                              },
                              'ai'
                            );
                            router.push('/recipe/preview' as any);
                          }
                        }}
                      >
                        <Text style={[styles.mealType, { color: colors.tint }]}>
                          {MEAL_LABELS[meal.meal_type] || meal.meal_type}
                          {meal.source_type === 'generated' ? ' · AI Draft' : ''}
                        </Text>
                        <Text style={[styles.mealTitle, { color: colors.text }]}>
                          {meal.recipe_id ? mealTitle(recipe) : mealName}
                        </Text>
                        <Text style={[styles.mealMeta, { color: colors.textSecondary }]}>
                          {meal.servings} serving{meal.servings !== 1 ? 's' : ''}
                          {caloriesPerServing ? ` · ${Math.round(caloriesPerServing * meal.servings)} kcal` : ''}
                        </Text>
                      </TouchableOpacity>
                      {meal.source_type === 'generated' && generated && (
                        <Button
                          title={savingMealItemId === meal.id ? 'Saving...' : 'Save Recipe'}
                          onPress={() => saveGeneratedRecipe(meal)}
                          loading={savingMealItemId === meal.id}
                          size="sm"
                          variant="outline"
                          style={{ marginTop: Spacing.sm }}
                        />
                      )}
                      <View style={styles.feedbackRow}>
                        <TouchableOpacity
                          style={[styles.feedbackChip, { borderColor: colors.border }]}
                          onPress={() => logPreferenceFeedback({ mealItem: meal, feedbackType: 'liked' })}
                          disabled={feedbackLoadingId === meal.id}
                        >
                          <Text style={[styles.feedbackText, { color: colors.text }]}>Like</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.feedbackChip, { borderColor: colors.border }]}
                          onPress={() =>
                            logPreferenceFeedback({
                              mealItem: meal,
                              feedbackType: 'disliked',
                              reason: "don't like taste",
                            })
                          }
                          disabled={feedbackLoadingId === meal.id}
                        >
                          <Text style={[styles.feedbackText, { color: colors.text }]}>Dislike</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.feedbackChip, { borderColor: colors.border }]}
                          onPress={() =>
                            logPreferenceFeedback({
                              mealItem: meal,
                              feedbackType: 'swapped',
                              reason: 'swapped for another option',
                            })
                          }
                          disabled={feedbackLoadingId === meal.id}
                        >
                          <Text style={[styles.feedbackText, { color: colors.text }]}>Swap</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.feedbackChip, { borderColor: colors.border }]}
                          onPress={() => logPreferenceFeedback({ mealItem: meal, feedbackType: 'cooked' })}
                          disabled={feedbackLoadingId === meal.id}
                        >
                          <Text style={[styles.feedbackText, { color: colors.text }]}>Cooked</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.feedbackChip, { borderColor: colors.border }]}
                          onPress={() =>
                            logPreferenceFeedback({
                              mealItem: meal,
                              feedbackType: 'skipped',
                              reason: 'skipped meal',
                            })
                          }
                          disabled={feedbackLoadingId === meal.id}
                        >
                          <Text style={[styles.feedbackText, { color: colors.text }]}>Skipped</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No meal plan yet"
            description={
              recipes && recipes.length > 0
                ? 'Tap the button below to generate a weekly meal plan based on your recipes and nutrition goals.'
                : 'Add some recipes first, then generate a meal plan.'
            }
            actionLabel={recipes && recipes.length > 0 ? 'Generate Meal Plan' : 'Add Recipes'}
            onAction={
              recipes && recipes.length > 0
                ? generateMealPlan
                : () => router.push('/recipe/add' as any)
            }
          />
          {generating && (
            <View style={styles.generatingOverlay}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.generatingText, { color: colors.text }]}>
                AI is creating your meal plan...
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  weekLabel: { fontSize: FontSize.sm, fontWeight: '500' },
  daySection: { marginBottom: Spacing.lg },
  dayTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold, marginBottom: Spacing.sm },
  mealCard: { marginBottom: Spacing.sm },
  mealType: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  mealTitle: { fontSize: FontSize.md, fontWeight: '600', marginTop: 2 },
  mealMeta: { fontSize: FontSize.sm, marginTop: 2 },
  feedbackRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  feedbackChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  feedbackText: { fontSize: FontSize.xs, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  generatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  generatingText: { fontSize: FontSize.md, fontWeight: '500' },
});
