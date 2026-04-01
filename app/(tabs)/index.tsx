/**
 * Today tab — the daily hub you see every time you open the app.
 * Shows today's meals from the active plan, food logging buttons per meal slot,
 * a daily macro/calorie progress bar, and AI adjustment suggestions.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { MacroColors } from '@/constants/Colors';
import { Card, Button, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import type {
  MealPlan,
  MealPlanItem,
  BodyGoal,
  Profile,
  Recipe,
  FoodLog,
  PlanAdjustment,
} from '@/types/database';

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

/** Get the day-of-week key for today (e.g. "monday") */
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

export default function TodayScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

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

  // Food logs for today
  const todayDate = new Date().toISOString().split('T')[0];
  const { data: foodLogs } = useSupabaseQuery<FoodLog>(
    ['food_logs', todayDate],
    'food_logs',
    {
      filter: { user_id: user?.id, date: todayDate },
    }
  );

  // Plan adjustments that are pending
  const { data: adjustments } = useSupabaseQuery<PlanAdjustment>(
    ['plan_adjustments', activePlan?.id ?? ''],
    'plan_adjustments',
    {
      filter: { user_id: user?.id, meal_plan_id: activePlan?.id, status: 'pending' },
      enabled: !!activePlan,
    }
  );

  const todayKey = getTodayKey();

  // Get today's planned meals, sorted by meal type order
  const todayMeals = useMemo(() => {
    if (!planItems) return [];
    return planItems
      .filter((item) => item.day_of_week === todayKey)
      .sort(
        (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
      );
  }, [planItems, todayKey]);

  // Calculate daily macros from planned meals + logged deviations
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
      plannedCals += (recipe?.calories_per_serving ?? 0) * item.servings;
      plannedProtein += (recipe?.protein_per_serving ?? 0) * item.servings;
      plannedCarbs += (recipe?.carbs_per_serving ?? 0) * item.servings;
      plannedFat += (recipe?.fat_per_serving ?? 0) * item.servings;
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

    const targetCals = (goal?.daily_calories ?? plannedCals) || 2000;
    const consumedCals = loggedCount > 0 ? loggedCals : 0;

    return {
      targetCals: Math.round(targetCals),
      plannedCals: Math.round(plannedCals),
      consumedCals: Math.round(consumedCals),
      loggedCount,
      macros: {
        protein: { consumed: loggedProtein, target: goal?.protein_g ?? plannedProtein },
        carbs: { consumed: loggedCarbs, target: goal?.carbs_g ?? plannedCarbs },
        fat: { consumed: loggedFat, target: goal?.fat_g ?? plannedFat },
      },
    };
  }, [todayMeals, foodLogs, goal]);

  // Check if a meal slot has been logged
  function getLogForMeal(mealType: string): FoodLog | undefined {
    return foodLogs?.find((log) => log.meal_type === mealType);
  }

  // Figure out what greeting to show based on time of day
  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  const progressPct = dailyProgress.targetCals > 0
    ? Math.min(100, Math.round((dailyProgress.consumedCals / dailyProgress.targetCals) * 100))
    : 0;

  // ---- EMPTY STATE (no active plan) ----
  if (!activePlan || !planItems || planItems.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.emptyContent}
      >
        <View style={styles.topRow}>
          <View style={styles.topRowLeft} />
          <TouchableOpacity onPress={() => router.push('/profile' as any)}>
            <Icon name="users" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.emptyHeadline, { color: colors.text }]}>
          Ready to plan your nourishment
        </Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
          Start by adding some recipes you love, then build a weekly meal plan tailored to your goals.
        </Text>

        <Button
          title="Add Your First Recipes"
          onPress={() => router.push('/(tabs)/recipes' as any)}
          size="lg"
          style={styles.ctaButton}
        />
        <Button
          title="Generate a Meal Plan"
          onPress={() => router.push('/meal-plan' as any)}
          variant="outline"
          size="lg"
        />
      </ScrollView>
    );
  }

  // ---- TODAY VIEW ----
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header row: greeting + profile icon */}
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.dateText, { color: colors.text }]}>
            {formatDate()}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.profileButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/profile' as any)}
        >
          <Icon name="users" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Daily calorie progress */}
      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            DAILY PROGRESS
          </Text>
          <Text style={[styles.progressCals, { color: colors.text }]}>
            {dailyProgress.consumedCals > 0
              ? `${dailyProgress.consumedCals} / ${dailyProgress.targetCals} kcal`
              : `${dailyProgress.plannedCals} kcal planned`}
          </Text>
        </View>

        {/* Progress bar */}
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

        {/* Macro summary row */}
        <View style={styles.macroRow}>
          {[
            { label: 'Protein', target: dailyProgress.macros.protein.target, consumed: dailyProgress.macros.protein.consumed, color: MacroColors.protein },
            { label: 'Carbs', target: dailyProgress.macros.carbs.target, consumed: dailyProgress.macros.carbs.consumed, color: MacroColors.carbs },
            { label: 'Fat', target: dailyProgress.macros.fat.target, consumed: dailyProgress.macros.fat.consumed, color: MacroColors.fats },
          ].map((macro) => (
            <View key={macro.label} style={styles.macroItem}>
              <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>
                {macro.label.toUpperCase()}
              </Text>
              <Text style={[styles.macroValue, { color: colors.text }]}>
                {macro.consumed > 0
                  ? `${Math.round(macro.consumed)}g`
                  : `${Math.round(macro.target)}g`}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Today's Meals */}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>
        TODAY'S MEALS
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {todayMeals.length > 0 ? (
        todayMeals.map((item) => {
          const recipe = item.recipe as unknown as Recipe;
          const mealLog = getLogForMeal(item.meal_type);
          const cals = Math.round((recipe?.calories_per_serving ?? 0) * item.servings);

          let statusColor = colors.tabIconDefault;
          let statusText = 'Planned';
          if (mealLog) {
            if (mealLog.status === 'on_track') {
              statusColor = colors.success;
              statusText = 'On Track';
            } else if (mealLog.status === 'deviated') {
              statusColor = colors.warning;
              statusText = 'Deviated';
            } else if (mealLog.status === 'skipped') {
              statusColor = colors.textSecondary;
              statusText = 'Skipped';
            }
          }

          return (
            <View key={item.id} style={[styles.mealSlot, { borderBottomColor: colors.border }]}>
              <View style={styles.mealSlotHeader}>
                <Text style={[styles.mealTypeLabel, { color: colors.textSecondary }]}>
                  {MEAL_LABELS[item.meal_type]}
                </Text>
                <View style={styles.mealSlotRight}>
                  <Text style={[styles.mealCals, { color: colors.textSecondary }]}>
                    {cals} kcal
                  </Text>
                  {recipe?.prep_time_minutes && (
                    <Text style={[styles.mealPrep, { color: colors.textSecondary }]}>
                      {recipe.prep_time_minutes} min prep
                    </Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push(`/recipe/${item.recipe_id}` as any)}
              >
                <Text style={[styles.mealTitle, { color: colors.text }]}>
                  {mealTitle(recipe)}
                </Text>
              </TouchableOpacity>

              {/* Macro row for this meal */}
              {recipe && (
                <View style={styles.mealMacroRow}>
                  {[
                    { label: 'PROTEIN', val: recipe.protein_per_serving },
                    { label: 'CARBS', val: recipe.carbs_per_serving },
                    { label: 'FAT', val: recipe.fat_per_serving },
                  ].map((m) => (
                    <View key={m.label} style={styles.mealMacroItem}>
                      <Text style={[styles.mealMacroLabel, { color: colors.textSecondary }]}>
                        {m.label}
                      </Text>
                      <Text style={[styles.mealMacroValue, { color: colors.text }]}>
                        {Math.round((m.val ?? 0) * item.servings)}g
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Status + Log button row */}
              <View style={styles.mealActions}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {statusText}
                  </Text>
                </View>

                {!mealLog && (
                  <TouchableOpacity
                    style={[styles.logButton, { borderColor: colors.border }]}
                    onPress={() =>
                      router.push(
                        `/food-log?meal_type=${item.meal_type}&meal_plan_item_id=${item.id}` as any
                      )
                    }
                  >
                    <Icon name="camera" size={16} color={colors.text} />
                    <Text style={[styles.logButtonText, { color: colors.text }]}>
                      Log Meal
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      ) : (
        <Text style={[styles.noMealsText, { color: colors.textSecondary }]}>
          No meals planned for today. Check your weekly plan or generate a new one.
        </Text>
      )}

      {/* Unplanned meal logging — for meals not in the plan */}
      <TouchableOpacity
        style={[styles.logUnplannedBtn, { borderColor: colors.border }]}
        onPress={() => router.push('/food-log' as any)}
      >
        <Icon name="camera" size={18} color={colors.text} />
        <Text style={[styles.logUnplannedText, { color: colors.text }]}>
          Log an unplanned meal
        </Text>
      </TouchableOpacity>

      {/* AI Adjustment Cards */}
      {adjustments && adjustments.length > 0 && (
        <View style={styles.adjustmentSection}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            AI ADJUSTMENTS
          </Text>
          {adjustments.map((adj) => (
            <Card key={adj.id} style={styles.adjustmentCard}>
              <View style={styles.adjustmentHeader}>
                <Icon name="sparkles" size={16} color={colors.warning} />
                <Text style={[styles.adjustmentLabel, { color: colors.warning }]}>
                  PLAN ADJUSTED
                </Text>
              </View>
              <Text style={[styles.adjustmentReason, { color: colors.text }]}>
                {adj.reason}
              </Text>
              <View style={styles.adjustmentActions}>
                <TouchableOpacity>
                  <Text style={[styles.adjustmentLink, { color: colors.success }]}>
                    APPROVE
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity>
                  <Text style={[styles.adjustmentLinkDismiss, { color: colors.textSecondary }]}>
                    DISMISS
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Quick craving input */}
      <Card style={styles.cravingCard}>
        <Text style={[styles.cravingLabel, { color: colors.textSecondary }]}>
          CRAVING SOMETHING?
        </Text>
        <TouchableOpacity
          style={[styles.cravingInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={() => router.push('/recipe/add?mode=ai' as any)}
        >
          <Icon name="sparkles" size={16} color={colors.tabIconDefault} />
          <Text style={[styles.cravingPlaceholder, { color: colors.tabIconDefault }]}>
            Tell AI what you feel like eating...
          </Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: 60, paddingBottom: 100 },

  // Top row
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  topRowLeft: { flex: 1 },
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

  // Progress card
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

  // Section labels
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  divider: { height: 1, marginBottom: Spacing.md },

  // Meal slots
  mealSlot: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mealSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mealTypeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  mealSlotRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mealCals: { fontSize: FontSize.sm },
  mealPrep: { fontSize: FontSize.xs, fontStyle: 'italic' },
  mealTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.serifRegular,
    marginBottom: Spacing.sm,
  },
  mealMacroRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  mealMacroItem: { gap: 1 },
  mealMacroLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  mealMacroValue: { fontSize: FontSize.sm },
  mealActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: FontSize.xs, fontWeight: '600' },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  logButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  noMealsText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    paddingVertical: Spacing.lg,
  },

  // Log unplanned meal
  logUnplannedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  logUnplannedText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },

  // AI Adjustments
  adjustmentSection: { marginBottom: Spacing.lg },
  adjustmentCard: { marginTop: Spacing.sm },
  adjustmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  adjustmentLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  adjustmentReason: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.serifItalic,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  adjustmentActions: { flexDirection: 'row', gap: Spacing.lg },
  adjustmentLink: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  adjustmentLinkDismiss: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },

  // Craving card
  cravingCard: { marginBottom: Spacing.md },
  cravingLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  cravingInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  cravingPlaceholder: { fontSize: FontSize.sm },

  // Empty state
  emptyContent: {
    flex: 1,
    padding: Spacing.lg,
    paddingTop: 60,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyHeadline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  ctaButton: { marginBottom: Spacing.sm },
});
