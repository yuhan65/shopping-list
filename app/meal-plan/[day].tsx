/**
 * Day detail screen — shows a single day's meals from the active plan.
 * Displays per-meal macro breakdown, daily total, calorie alerts,
 * and AI-suggested meal swaps when the day is over target.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { MacroColors, AccentColors } from '@/constants/Colors';
import { Card, AlertBanner, SwapCard } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import { minimumSafeCalories } from '@/lib/tdee';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { MealPlan, MealPlanItem, BodyGoal, Recipe, MealFeedback } from '@/types/database';

const DAY_NAMES: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLORS: Record<string, string> = {
  breakfast: AccentColors.proteinHigh,
  lunch: AccentColors.seafood,
  dinner: AccentColors.highCal,
  snack: AccentColors.plantBased,
};

export default function DayDetailScreen() {
  const { day } = useLocalSearchParams<{ day: string }>();
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localUpdate = useLocalDataStore((s) => s.update);
  const setPreviewDraft = useRecipePreviewStore((s) => s.setDraft);
  const queryClient = useQueryClient();
  const [feedbackBusyId, setFeedbackBusyId] = useState<string | null>(null);

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: plans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id, status: 'active' },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = plans?.[0];

  const { data: allItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  const dayMeals = useMemo(() => {
    if (!allItems || !day) return [];
    return allItems
      .filter((item) => item.day_of_week === day)
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
  }, [allItems, day]);

  // Daily totals
  const totals = useMemo(() => {
    let cals = 0, protein = 0, carbs = 0, fat = 0;
    for (const item of dayMeals) {
      const r = item.recipe as unknown as Recipe;
      cals += (r?.calories_per_serving ?? 0) * item.servings;
      protein += (r?.protein_per_serving ?? 0) * item.servings;
      carbs += (r?.carbs_per_serving ?? 0) * item.servings;
      fat += (r?.fat_per_serving ?? 0) * item.servings;
    }
    return { cals: Math.round(cals), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
  }, [dayMeals]);

  const targetCals = Math.max(goal?.daily_calories ?? 2000, minimumSafeCalories());
  const overBy = totals.cals > targetCals ? Math.round(((totals.cals - targetCals) / targetCals) * 100) : 0;
  const isOnTrack = overBy === 0 && totals.cals > 0;
  const dayName = DAY_NAMES[day ?? ''] ?? day;

  // Compute date string for the day within the active plan week
  const dateString = useMemo(() => {
    if (!activePlan?.week_start_date || !day) return '';
    const start = new Date(activePlan.week_start_date);
    const dayIndex = Object.keys(DAY_NAMES).indexOf(day);
    if (dayIndex < 0) return '';
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, [activePlan, day]);

  async function saveGeneratedRecipe(item: MealPlanItem) {
    const generatedRecipe = item.generated_recipe;
    if (!generatedRecipe || !user) return;

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
    } catch {
      // Keep UX simple on this detail screen; failed save just leaves the CTA.
    }
  }

  async function addMealFeedback(item: MealPlanItem, feedbackType: MealFeedback['feedback_type'], reason?: string) {
    if (!user) return;
    setFeedbackBusyId(item.id);
    const feedbackRow = {
      meal_plan_item_id: item.id,
      user_id: user.id,
      feedback_type: feedbackType,
      reason: reason || null,
    };
    const signalRow = {
      user_id: user.id,
      signal_type:
        feedbackType === 'liked' || feedbackType === 'cooked'
          ? 'recipe_like'
          : feedbackType === 'skipped'
            ? 'meal_skipped'
            : feedbackType === 'swapped'
              ? 'meal_swapped_out'
              : 'recipe_dislike',
      entity_type: 'meal_plan_item',
      entity_key: item.id,
      weight: 1,
      metadata: { reason: reason || null },
    };

    try {
      if (isDemoMode) {
        localInsert('meal_feedback', feedbackRow);
        localInsert('user_preference_signals', signalRow);
      } else {
        const { error: feedbackError } = await supabase.from('meal_feedback').insert(feedbackRow);
        if (feedbackError) throw feedbackError;
        const { error: signalError } = await supabase.from('user_preference_signals').insert(signalRow);
        if (signalError) throw signalError;
      }
      queryClient.invalidateQueries({ queryKey: ['meal_feedback'] });
      queryClient.invalidateQueries({ queryKey: ['user_preference_signals'] });
    } finally {
      setFeedbackBusyId(null);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>{'<'} BACK TO WEEK</Text>
        </TouchableOpacity>
        <View style={styles.dayHeader}>
          <View>
            <Text style={[styles.dayName, { color: colors.text }]}>{dayName}</Text>
            {dateString !== '' && (
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dateString}</Text>
            )}
          </View>
          <Text style={[styles.dayCals, { color: colors.textSecondary }]}>
            {totals.cals.toLocaleString()} kcal
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Calorie alert */}
        {overBy > 0 && (
          <AlertBanner
            message={`High calorie day detected (${overBy}% above baseline)`}
            variant="danger"
          />
        )}

        {/* Macro breakdown */}
        <Text style={[styles.sectionLabel, { color: colors.text }]}>MACRO BREAKDOWN</Text>
        <View style={styles.macroRow}>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.protein }]}>{totals.protein}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>PROTEIN</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.carbs }]}>{totals.carbs}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>CARBS</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.fats }]}>{totals.fat}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>FAT</Text>
          </View>
        </View>

        {/* Meal cards */}
        {dayMeals.map((item) => {
          const recipe = item.recipe as unknown as Recipe;
          const generated = item.generated_recipe;
          const cals = Math.round(((recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings));
          const protein = Math.round(((recipe?.protein_per_serving ?? generated?.protein_per_serving ?? 0) * item.servings));
          const carbsVal = Math.round(((recipe?.carbs_per_serving ?? generated?.carbs_per_serving ?? 0) * item.servings));
          const mealColor = MEAL_COLORS[item.meal_type] || colors.text;
          const title = recipe?.title || generated?.title || item.generated_title || 'Generated meal';

          return (
            <View key={item.id} style={[styles.mealCard, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  if (item.recipe_id) {
                    router.push(`/recipe/${item.recipe_id}` as any);
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
                activeOpacity={0.7}
                disabled={!item.recipe_id && !generated}
              >
                <View style={styles.mealTypeRow}>
                  <View style={[styles.mealTypeDot, { backgroundColor: mealColor }]} />
                  <Text style={[styles.mealTypeText, { color: mealColor }]}>
                    {item.meal_type.toUpperCase()}
                    {item.source_type === 'generated' ? ' · AI DRAFT' : ''}
                  </Text>
                  {(recipe?.prep_time_minutes ?? generated?.prep_time_minutes) && (
                    <Text style={[styles.prepTime, { color: colors.textSecondary }]}>
                      {recipe?.prep_time_minutes ?? generated?.prep_time_minutes} min prep
                    </Text>
                  )}
                </View>
                <Text style={[styles.mealTitle, { color: colors.text }]}>
                  {item.recipe_id ? mealTitle(recipe) : title}
                </Text>
                <View style={styles.mealMacros}>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    CALS <Text style={{ fontWeight: '700', color: colors.text }}>{cals}</Text>
                  </Text>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    PROTEIN <Text style={{ fontWeight: '700', color: colors.text }}>{protein}g</Text>
                  </Text>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    CARBS <Text style={{ fontWeight: '700', color: colors.text }}>{carbsVal}g</Text>
                  </Text>
                </View>
              </TouchableOpacity>
              {item.source_type === 'generated' && item.generated_recipe && (
                <TouchableOpacity style={styles.saveBtn} onPress={() => saveGeneratedRecipe(item)}>
                  <Text style={[styles.saveBtnText, { color: colors.tint }]}>SAVE RECIPE</Text>
                </TouchableOpacity>
              )}
              <View style={styles.feedbackRow}>
                <TouchableOpacity
                  style={[styles.feedbackChip, { borderColor: colors.border }]}
                  disabled={feedbackBusyId === item.id}
                  onPress={() => addMealFeedback(item, 'liked')}
                >
                  <Text style={[styles.feedbackText, { color: colors.text }]}>Like</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackChip, { borderColor: colors.border }]}
                  disabled={feedbackBusyId === item.id}
                  onPress={() => addMealFeedback(item, 'disliked', "don't like taste")}
                >
                  <Text style={[styles.feedbackText, { color: colors.text }]}>Dislike</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackChip, { borderColor: colors.border }]}
                  disabled={feedbackBusyId === item.id}
                  onPress={() => addMealFeedback(item, 'swapped', 'swapped for another option')}
                >
                  <Text style={[styles.feedbackText, { color: colors.text }]}>Swap</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Daily total + status */}
        <View style={styles.dailyFooter}>
          <View>
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>DAILY TOTAL</Text>
            <Text style={[styles.footerValue, { color: colors.text }]}>
              {totals.cals.toLocaleString()} kcal
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>STATUS</Text>
            <Text
              style={[
                styles.footerValue,
                { color: isOnTrack ? colors.success : overBy > 0 ? colors.danger : colors.text },
              ]}
            >
              {isOnTrack ? 'On Track' : overBy > 0 ? 'Over' : '--'}
            </Text>
          </View>
        </View>

        {/* AI Optimization Swaps */}
        {overBy > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: Spacing.lg }]}>
              AI OPTIMIZATION SWAPS
            </Text>
            <View style={styles.swapsList}>
              <SwapCard
                title="Wild Sea Bass & Asparagus"
                subtitle={`Reduces total day by ${Math.round(overBy * targetCals / 100)} kcal`}
                recommended
              />
              <SwapCard
                title="Quinoa Stuffed Peppers"
                subtitle="Reduces total day by 180 kcal"
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  backRow: { marginBottom: Spacing.sm },
  backText: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dayName: { fontSize: FontSize.xxxl, fontFamily: FontFamily.serifBold },
  dateText: { fontSize: FontSize.sm, marginTop: 2 },
  dayCals: { fontSize: FontSize.sm, marginTop: 6 },
  content: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 100, gap: Spacing.md },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginTop: Spacing.md },

  // Macro breakdown
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  macroValue: { fontSize: FontSize.xl, fontWeight: '700' },
  macroLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 2 },

  // Meal card
  mealCard: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  mealTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealTypeDot: { width: 8, height: 8, borderRadius: 4 },
  mealTypeText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  prepTime: { fontSize: FontSize.xs },
  mealTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifRegular, marginTop: 2 },
  mealMacros: { flexDirection: 'row', gap: Spacing.lg, marginTop: 4 },
  mealMacroText: { fontSize: FontSize.xs, letterSpacing: 0.3 },
  saveBtn: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  saveBtnText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  feedbackRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  feedbackChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  feedbackText: { fontSize: FontSize.xs, fontWeight: '600' },

  // Footer
  dailyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
  },
  footerLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  footerValue: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold, marginTop: 2 },

  // Swaps
  swapsList: { gap: Spacing.md, marginTop: Spacing.sm },
});
