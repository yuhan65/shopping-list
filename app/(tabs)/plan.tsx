/**
 * Merged Plan tab — combines daily execution and weekly overview in one screen.
 * Shows daily progress, your up-next meal with logging actions, and weekly balance.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { MacroColors, AccentColors } from '@/constants/Colors';
import { Card, DotLegend, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import { minimumSafeCalories } from '@/lib/tdee';
import type { MealPlan, MealPlanItem, BodyGoal, Recipe, FoodLog } from '@/types/database';

const DAYS: { key: string; short: string }[] = [
  { key: 'monday', short: 'MON' },
  { key: 'tuesday', short: 'TUE' },
  { key: 'wednesday', short: 'WED' },
  { key: 'thursday', short: 'THU' },
  { key: 'friday', short: 'FRI' },
  { key: 'saturday', short: 'SAT' },
  { key: 'sunday', short: 'SUN' },
];

const DOT_LEGEND = [
  { color: AccentColors.proteinHigh, label: 'Protein High' },
  { color: AccentColors.lowCarb, label: 'Low Carb' },
  { color: AccentColors.plantBased, label: 'Plant Based' },
  { color: AccentColors.highCal, label: 'High Cal' },
  { color: AccentColors.seafood, label: 'Seafood' },
];

const MEAL_ORDER: ('breakfast' | 'lunch' | 'dinner' | 'snack')[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snack: 'SNACK',
};

const MEAL_ACCENTS: Record<string, string> = {
  breakfast: '#2D6A4F',
  lunch: '#C4963A',
  dinner: '#C75146',
  snack: '#8B8455',
};

function getTodayKey(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Pick a dot color based on the recipe's tags or macro profile */
function dotColorForRecipe(recipe?: Recipe): string {
  if (!recipe) return AccentColors.cream;
  const tags = (recipe.tags || []).map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes('seafood') || t.includes('fish'))) return AccentColors.seafood;
  if (tags.some((t) => t.includes('plant') || t.includes('vegan'))) return AccentColors.plantBased;
  if (tags.some((t) => t.includes('low carb') || t.includes('keto'))) return AccentColors.lowCarb;
  if (recipe.protein_per_serving && recipe.protein_per_serving > 30) return AccentColors.proteinHigh;
  if (recipe.calories_per_serving && recipe.calories_per_serving > 600) return AccentColors.highCal;
  return AccentColors.cream;
}

export default function PlanScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setPreviewDraft = useRecipePreviewStore((s) => s.setDraft);
  const [planView, setPlanView] = useState<'today' | 'week'>('today');

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: mealPlans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id, status: 'active' },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = mealPlans?.[0];

  const { data: planItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  const todayDate = new Date().toISOString().split('T')[0];
  const { data: foodLogs } = useSupabaseQuery<FoodLog>(
    ['food_logs', todayDate],
    'food_logs',
    {
      filter: { user_id: user?.id, date: todayDate },
    }
  );

  const todayKey = getTodayKey();

  const todayMeals = useMemo(() => {
    if (!planItems) return [];
    return planItems
      .filter((item) => item.day_of_week === todayKey)
      .sort(
        (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
      );
  }, [planItems, todayKey]);

  const dailyProgress = useMemo(() => {
    let plannedCals = 0;
    let plannedProtein = 0;
    let plannedCarbs = 0;
    let plannedFat = 0;
    let loggedCals = 0;
    let loggedProtein = 0;
    let loggedCarbs = 0;
    let loggedFat = 0;
    let loggedCount = 0;

    for (const item of todayMeals) {
      const recipe = item.recipe as unknown as Recipe;
      const generated = item.generated_recipe;
      plannedCals += (recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings;
      plannedProtein += (recipe?.protein_per_serving ?? generated?.protein_per_serving ?? 0) * item.servings;
      plannedCarbs += (recipe?.carbs_per_serving ?? generated?.carbs_per_serving ?? 0) * item.servings;
      plannedFat += (recipe?.fat_per_serving ?? generated?.fat_per_serving ?? 0) * item.servings;
    }

    if (foodLogs) {
      for (const log of foodLogs) {
        loggedCals += log.calories ?? 0;
        loggedProtein += log.protein_g ?? 0;
        loggedCarbs += log.carbs_g ?? 0;
        loggedFat += log.fat_g ?? 0;
        loggedCount++;
      }
    }

    const targetCals = Math.max((goal?.daily_calories ?? plannedCals) || 2000, minimumSafeCalories());
    const consumedCals = loggedCount > 0 ? loggedCals : 0;

    return {
      targetCals: Math.round(targetCals),
      plannedCals: Math.round(plannedCals),
      consumedCals: Math.round(consumedCals),
      macros: {
        protein: { consumed: loggedProtein, target: goal?.protein_g ?? plannedProtein },
        carbs: { consumed: loggedCarbs, target: goal?.carbs_g ?? plannedCarbs },
        fat: { consumed: loggedFat, target: goal?.fat_g ?? plannedFat },
      },
    };
  }, [todayMeals, foodLogs, goal]);

  function getLogForPlanItem(item: MealPlanItem): FoodLog | undefined {
    return foodLogs?.find(
      (log) =>
        log.meal_plan_item_id === item.id ||
        (!log.meal_plan_item_id && log.meal_type === item.meal_type)
    );
  }

  const upNextMealIndex = useMemo(
    () => todayMeals.findIndex((item) => !getLogForPlanItem(item)),
    [todayMeals, foodLogs]
  );
  const upNextMeal = upNextMealIndex >= 0 ? todayMeals[upNextMealIndex] : null;
  const dayIsComplete = todayMeals.length > 0 && upNextMealIndex === -1;

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function openCameraForMeal(item: MealPlanItem) {
    router.push(
      `/camera?mode=food-log&meal_type=${item.meal_type}&meal_plan_item_id=${item.id}` as any
    );
  }

  function openManualLog(item: MealPlanItem) {
    router.push(
      `/food-log?mode=planned&manual=1&meal_type=${item.meal_type}&meal_plan_item_id=${item.id}` as any
    );
  }

  // Weekly stats computed from plan items
  const weeklyStats = useMemo(() => {
    if (!planItems) return null;
    let totalCals = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    const dailyCals: Record<string, number> = {};
    const dailyDots: Record<string, string[]> = {};

    for (const item of planItems) {
      const recipe = item.recipe as unknown as Recipe;
      const generated = item.generated_recipe;
      const cals = (recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings;
      totalCals += cals;
      totalProtein += (recipe?.protein_per_serving ?? generated?.protein_per_serving ?? 0) * item.servings;
      totalCarbs += (recipe?.carbs_per_serving ?? generated?.carbs_per_serving ?? 0) * item.servings;
      totalFat += (recipe?.fat_per_serving ?? generated?.fat_per_serving ?? 0) * item.servings;

      dailyCals[item.day_of_week] = (dailyCals[item.day_of_week] || 0) + cals;
      if (!dailyDots[item.day_of_week]) dailyDots[item.day_of_week] = [];
      dailyDots[item.day_of_week].push(dotColorForRecipe(recipe));
    }

    // Determine macro balance label
    const targetCals = Math.max(goal?.daily_calories ?? 2000, minimumSafeCalories()) * 7;
    const ratio = totalCals / targetCals;
    const balance = ratio > 1.05 ? 'Over' : ratio < 0.95 ? 'Under' : 'Optimal';

    return { totalCals: Math.round(totalCals), totalProtein, totalCarbs, totalFat, dailyCals, dailyDots, balance };
  }, [planItems, goal]);

  // ---- EMPTY STATE (no active plan) ----
  if (!activePlan || !planItems || planItems.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.emptyContent}
      >
        <Text style={[styles.emptyHeadline, { color: colors.text }]}>
          Ready to plan your nourishment
        </Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
          Start by adding some recipes you love, then build a weekly meal plan tailored to your goals.
        </Text>

        <TouchableOpacity
          style={[styles.regenButton, { borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/recipes' as any)}
        >
          <Text style={[styles.regenText, { color: colors.text }]}>ADD YOUR FIRST RECIPES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.regenButton, { borderColor: colors.border }]}
          onPress={() => router.push('/meal-plan' as any)}
        >
          <Text style={[styles.regenText, { color: colors.text }]}>GENERATE A MEAL PLAN</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const progressPct = dailyProgress.targetCals > 0
    ? Math.min(100, Math.round((dailyProgress.consumedCals / dailyProgress.targetCals) * 100))
    : 0;

  // ---- MERGED PLAN VIEW ----
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()}</Text>
          <Text style={[styles.dateText, { color: colors.text }]}>{formatDate()}</Text>
        </View>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>DAILY PROGRESS</Text>
          <Text style={[styles.progressCals, { color: colors.text }]}>
            {dailyProgress.consumedCals > 0
              ? `${dailyProgress.consumedCals} / ${dailyProgress.targetCals} kcal`
              : `${dailyProgress.plannedCals} kcal planned`}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: progressPct > 100 ? colors.warning : colors.success,
                width: `${Math.min(progressPct, 100)}%`,
              },
            ]}
          />
        </View>
        <View style={styles.macroRow}>
          {[
            { label: 'Protein', target: dailyProgress.macros.protein.target, consumed: dailyProgress.macros.protein.consumed, color: MacroColors.protein },
            { label: 'Carbs', target: dailyProgress.macros.carbs.target, consumed: dailyProgress.macros.carbs.consumed, color: MacroColors.carbs },
            { label: 'Fat', target: dailyProgress.macros.fat.target, consumed: dailyProgress.macros.fat.consumed, color: MacroColors.fats },
          ].map((macro) => (
            <View key={macro.label} style={styles.macroItem}>
              <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>{macro.label.toUpperCase()}</Text>
              <Text style={[styles.macroValue, { color: colors.text }]}>
                {macro.consumed > 0 ? `${Math.round(macro.consumed)}g` : `${Math.round(macro.target)}g`}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={[styles.toggleWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.toggleItem,
            planView === 'today' && { backgroundColor: colors.background, borderColor: colors.border },
          ]}
          onPress={() => setPlanView('today')}
        >
          <Text
            style={[
              styles.toggleText,
              { color: planView === 'today' ? colors.text : colors.textSecondary },
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleItem,
            planView === 'week' && { backgroundColor: colors.background, borderColor: colors.border },
          ]}
          onPress={() => setPlanView('week')}
        >
          <Text
            style={[
              styles.toggleText,
              { color: planView === 'week' ? colors.text : colors.textSecondary },
            ]}
          >
            This Week
          </Text>
        </TouchableOpacity>
      </View>

      {planView === 'today' && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>TODAY&apos;S MEALS</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {dayIsComplete ? (
            <>
              <Card style={[styles.dayCompleteCard, { borderColor: colors.success, backgroundColor: colors.successLight }]}>
                <View style={styles.dayCompleteHeader}>
                  <Icon name="check-circle" size={20} color={colors.success} />
                  <Text style={[styles.dayCompleteTitle, { color: colors.success }]}>Day Complete</Text>
                </View>
                <Text style={[styles.dayCompleteSub, { color: colors.text }]}>
                  Great work. You logged all {todayMeals.length} planned meals today.
                </Text>
                <Text style={[styles.dayCompleteMeta, { color: colors.textSecondary }]}>
                  {dailyProgress.consumedCals} kcal consumed
                </Text>
              </Card>
              {todayMeals.map((item) => {
                const recipe = item.recipe as unknown as Recipe;
                const generated = item.generated_recipe;
                const mealLog = getLogForPlanItem(item);
                const mealTitleText = item.recipe_id
                  ? mealTitle(recipe)
                  : generated?.title || item.generated_title || 'Quick meal';
                const loggedCals = mealLog?.calories ?? Math.round(
                  (recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings
                );
                return (
                  <Card key={item.id} style={styles.compactMealCard}>
                    <View style={styles.compactMealTop}>
                      <Text style={[styles.compactMealType, { color: colors.textSecondary }]}>
                        {MEAL_LABELS[item.meal_type]}
                      </Text>
                      <Text style={[styles.compactMealCals, { color: colors.textSecondary }]}>{Math.round(loggedCals)} kcal</Text>
                    </View>
                    <Text style={[styles.compactMealTitle, { color: colors.text }]} numberOfLines={1}>
                      {mealTitleText}
                    </Text>
                  </Card>
                );
              })}
            </>
          ) : todayMeals.length > 0 ? (
            todayMeals.map((item, index) => {
              const recipe = item.recipe as unknown as Recipe;
              const generated = item.generated_recipe;
              const cals = Math.round(
                (recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings
              );
              const protein = Math.round(
                (recipe?.protein_per_serving ?? generated?.protein_per_serving ?? 0) * item.servings
              );
              const carbs = Math.round(
                (recipe?.carbs_per_serving ?? generated?.carbs_per_serving ?? 0) * item.servings
              );
              const fat = Math.round(
                (recipe?.fat_per_serving ?? generated?.fat_per_serving ?? 0) * item.servings
              );
              const prepMinutes = recipe?.prep_time_minutes ?? generated?.prep_time_minutes;
              const accent = MEAL_ACCENTS[item.meal_type] ?? colors.tint;
              const isFocusedUpNext = !!upNextMeal && item.id === upNextMeal.id;
              const isBeforeUpNext = upNextMealIndex > 0 && index < upNextMealIndex;

              if (isBeforeUpNext) {
                return (
                  <View key={item.id} style={[styles.collapsedMealBar, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.collapsedMealLabel, { color: colors.textSecondary }]}>
                      {MEAL_LABELS[item.meal_type]}
                    </Text>
                    <Text style={[styles.collapsedMealStatus, { color: colors.success }]}>Logged</Text>
                  </View>
                );
              }

              if (isFocusedUpNext) {
                return (
                  <Card key={item.id} style={[styles.focusedMealCard, { borderColor: colors.success }]}>
                    <View style={styles.currentMealTop}>
                      <Text style={[styles.currentMealType, { color: accent }]}>
                        {MEAL_LABELS[item.meal_type]}
                      </Text>
                      <View style={styles.mealMetaRight}>
                        <Text style={[styles.currentMealCals, { color: colors.textSecondary }]}>{cals} kcal</Text>
                        {!!prepMinutes && (
                          <Text style={[styles.mealPrep, { color: colors.textSecondary }]}>
                            {prepMinutes} min prep
                          </Text>
                        )}
                      </View>
                    </View>
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
                      disabled={!item.recipe_id && !generated}
                    >
                      <Text style={[styles.currentMealTitle, { color: colors.text }]}>
                        {item.recipe_id
                          ? mealTitle(recipe)
                          : generated?.title || item.generated_title || 'Quick meal'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.focusedMacroRow}>
                      <Text style={[styles.focusedMacroLabel, { color: colors.textSecondary }]}>
                        PROTEIN <Text style={[styles.focusedMacroValue, { color: colors.text }]}>{protein}g</Text>
                      </Text>
                      <Text style={[styles.focusedMacroLabel, { color: colors.textSecondary }]}>
                        CARBS <Text style={[styles.focusedMacroValue, { color: colors.text }]}>{carbs}g</Text>
                      </Text>
                      <Text style={[styles.focusedMacroLabel, { color: colors.textSecondary }]}>
                        FAT <Text style={[styles.focusedMacroValue, { color: colors.text }]}>{fat}g</Text>
                      </Text>
                    </View>
                    <View style={styles.currentMealActions}>
                      <TouchableOpacity
                        style={[styles.primaryAction, { backgroundColor: colors.text }]}
                        onPress={() => openCameraForMeal(item)}
                      >
                        <Icon name="camera" size={16} color={colors.background} />
                        <Text style={[styles.primaryActionText, { color: colors.background }]}>
                          Log meal
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondaryAction, { borderColor: colors.border }]}
                        onPress={() => openManualLog(item)}
                      >
                        <Text style={[styles.secondaryActionText, { color: colors.text }]}>Log manually</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              }

              return (
                <Card key={item.id} style={styles.currentMealCard}>
                  <View style={styles.currentMealTop}>
                    <Text style={[styles.currentMealType, { color: colors.textSecondary }]}>
                      {MEAL_LABELS[item.meal_type]}
                    </Text>
                    <View style={styles.mealMetaRight}>
                      <Text style={[styles.currentMealCals, { color: colors.textSecondary }]}>{cals} kcal</Text>
                      {!!prepMinutes && (
                        <Text style={[styles.mealPrep, { color: colors.textSecondary }]}>
                          {prepMinutes} min prep
                        </Text>
                      )}
                    </View>
                  </View>
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
                    disabled={!item.recipe_id && !generated}
                  >
                    <Text style={[styles.currentMealTitle, { color: colors.text }]}>
                      {item.recipe_id
                        ? mealTitle(recipe)
                        : generated?.title || item.generated_title || 'Quick meal'}
                    </Text>
                  </TouchableOpacity>
                </Card>
              );
            })
          ) : (
            <Card style={styles.currentMealCard}>
              <Text style={[styles.noMealsText, { color: colors.textSecondary }]}>
                No meals planned for today yet.
              </Text>
            </Card>
          )}
        </>
      )}

      {planView === 'week' && weeklyStats && (
        <Card style={styles.weeklyCard}>
          <View style={styles.weekHeader}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>WEEKLY OVERVIEW</Text>
            {activePlan.week_start_date != null && activePlan.week_start_date !== '' && (
              <Text style={[styles.weekDate, { color: colors.textSecondary }]}>
                {String(activePlan.week_start_date)}
              </Text>
            )}
          </View>

          <View style={styles.dotGrid}>
            {DAYS.map(({ key, short }) => {
              const dots = weeklyStats.dailyDots[key] || [];
              const cals = weeklyStats.dailyCals[key] || 0;
              const todayIndex = (new Date().getDay() + 6) % 7;
              const dayIndex = DAYS.findIndex((d) => d.key === key);
              const isToday = dayIndex === todayIndex;

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dotColumn,
                    isToday && { backgroundColor: colors.tintLight, borderRadius: BorderRadius.sm },
                  ]}
                  onPress={() => router.push(`/meal-plan/${key}` as any)}
                >
                  <Text style={[styles.dayShort, { color: isToday ? colors.text : colors.textSecondary }]}>
                    {short}
                  </Text>
                  <View style={styles.dotsContainer}>
                    {dots.slice(0, 3).map((color, i) => (
                      <View key={i} style={[styles.mealDot, { backgroundColor: color }]} />
                    ))}
                    {dots.length === 0 && <View style={[styles.mealDot, { backgroundColor: colors.border }]} />}
                  </View>
                  <Text style={[styles.dayCals, { color: colors.textSecondary }]}>
                    {Math.round(cals).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.weekTotals}>
            <View>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>WEEKLY TOTAL</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {weeklyStats.totalCals.toLocaleString()} kcal
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>MACROS BALANCE</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>{weeklyStats.balance}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.regenButton, { borderColor: colors.border }]}
            onPress={() => router.push('/meal-plan' as any)}
          >
            <Text style={[styles.regenText, { color: colors.text }]}>REGENERATE WEEKLY PLAN</Text>
          </TouchableOpacity>
          <DotLegend items={DOT_LEGEND} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: 60, paddingBottom: 100 },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateText: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressCard: { marginBottom: Spacing.lg },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  progressCals: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  macroDot: { width: 6, height: 6, borderRadius: 3 },
  macroLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  macroValue: { fontSize: FontSize.sm, fontWeight: '600' },

  // ---- Weekly overview ----
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  weekDate: { fontSize: FontSize.xs },
  dotGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  dotColumn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  dayShort: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  dotsContainer: { flexDirection: 'column', gap: 4, minHeight: 36, justifyContent: 'center' },
  mealDot: { width: 10, height: 10, borderRadius: 5 },
  dayCals: { fontSize: 10 },

  // ---- Totals ----
  weekTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  totalLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  totalValue: { fontSize: FontSize.xl, fontFamily: FontFamily.serifBold, marginTop: 2 },

  // ---- Regenerate button ----
  regenButton: {
    borderWidth: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  regenText: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },

  // ---- Divider ----
  divider: { height: 1, marginBottom: Spacing.md },
  toggleWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
    marginBottom: Spacing.lg,
  },
  toggleItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
  },
  toggleText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dayCompleteCard: {
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  dayCompleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dayCompleteTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dayCompleteSub: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: 4,
  },
  dayCompleteMeta: {
    fontSize: FontSize.xs,
  },
  compactMealCard: {
    marginBottom: Spacing.sm,
  },
  compactMealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  compactMealType: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  compactMealCals: {
    fontSize: FontSize.xs,
  },
  compactMealTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.serifRegular,
  },
  collapsedMealBar: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  collapsedMealLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  collapsedMealStatus: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },

  currentMealCard: { marginBottom: Spacing.sm },
  focusedMealCard: {
    marginBottom: Spacing.sm,
    borderWidth: 2,
  },
  currentMealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mealMetaRight: { alignItems: 'flex-end', gap: 2 },
  currentMealType: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  currentMealCals: { fontSize: FontSize.sm },
  mealPrep: { fontSize: FontSize.xs, fontStyle: 'italic' },
  currentMealTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.serifRegular,
    marginBottom: Spacing.md,
  },
  focusedMacroRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  focusedMacroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  focusedMacroValue: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  currentMealActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  primaryActionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  secondaryAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
  },
  secondaryActionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noMealsText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  todayMealsLink: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  weeklyCard: { marginTop: Spacing.sm },

  // ---- Empty state ----
  emptyContent: {
    flex: 1,
    padding: Spacing.lg,
    paddingTop: Spacing.xxl + 40,
    justifyContent: 'center',
  },
  emptyHeadline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.md,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
});
